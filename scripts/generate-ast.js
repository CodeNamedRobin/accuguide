#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Parse a file into an AST
 * @param {string} filePath - Path to the file
 * @returns {object} AST object
 */
function parseFileToAST(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);
  
  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        ext === '.tsx' ? 'tsx' : null,
        'classProperties',
        'decorators-legacy',
        'dynamicImport',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator'
      ].filter(Boolean)
    });
    
    return ast;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Analyze AST and extract information
 * @param {object} ast - The AST object
 * @returns {object} Analysis results
 */
function analyzeAST(ast) {
  const analysis = {
    functions: [],
    components: [],
    imports: [],
    exports: [],
    variables: [],
    classes: [],
  };
  
  traverse(ast, {
    FunctionDeclaration(path) {
      analysis.functions.push({
        name: path.node.id?.name || 'anonymous',
        params: path.node.params.length,
        async: path.node.async,
        generator: path.node.generator,
      });
    },
    
    ArrowFunctionExpression(path) {
      if (path.parent.type === 'VariableDeclarator') {
        analysis.functions.push({
          name: path.parent.id.name,
          params: path.node.params.length,
          async: path.node.async,
          type: 'arrow',
        });
      }
    },
    
    // Detect React components
    JSXElement(path) {
      let parent = path.getFunctionParent();
      if (parent) {
        const name = parent.node.id?.name || 
                    (parent.parent?.id?.name);
        if (name && !analysis.components.find(c => c.name === name)) {
          analysis.components.push({
            name,
            type: parent.node.type.includes('Arrow') ? 'functional' : 'functional',
          });
        }
      }
    },
    
    ImportDeclaration(path) {
      analysis.imports.push({
        source: path.node.source.value,
        specifiers: path.node.specifiers.map(s => s.local.name),
      });
    },
    
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const declaration = path.node.declaration;
        if (declaration.declarations) {
          declaration.declarations.forEach(d => {
            analysis.exports.push({
              name: d.id.name,
              type: 'named',
            });
          });
        } else if (declaration.id) {
          analysis.exports.push({
            name: declaration.id.name,
            type: 'named',
          });
        }
      }
    },
    
    ExportDefaultDeclaration(path) {
      const declaration = path.node.declaration;
      const name = declaration.id?.name || 
                  declaration.name || 
                  'default';
      analysis.exports.push({
        name,
        type: 'default',
      });
    },
    
    VariableDeclaration(path) {
      path.node.declarations.forEach(d => {
        if (d.id.name) {
          analysis.variables.push({
            name: d.id.name,
            kind: path.node.kind, // const, let, var
          });
        }
      });
    },
    
    ClassDeclaration(path) {
      analysis.classes.push({
        name: path.node.id.name,
        superClass: path.node.superClass?.name || null,
      });
    },
  });
  
  return analysis;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node generate-ast.js <file-path> [--analyze] [--save]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/generate-ast.js src/app/page.tsx');
    console.log('  node scripts/generate-ast.js src/app/page.tsx --analyze');
    console.log('  node scripts/generate-ast.js src/app/page.tsx --save');
    console.log('');
    console.log('Options:');
    console.log('  --analyze  Show analysis of AST structure');
    console.log('  --save     Save AST to JSON file');
    process.exit(1);
  }
  
  const filePath = path.resolve(args[0]);
  const shouldAnalyze = args.includes('--analyze');
  const shouldSave = args.includes('--save');
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`🔍 Parsing: ${path.relative(process.cwd(), filePath)}\n`);
  
  const ast = parseFileToAST(filePath);
  
  if (!ast) {
    console.error('Failed to generate AST');
    process.exit(1);
  }
  
  console.log('✅ AST generated successfully!\n');
  console.log(`AST Root: ${ast.type}`);
  console.log(`Program Body: ${ast.program.body.length} top-level statements\n`);
  
  if (shouldAnalyze) {
    console.log('📊 AST Analysis:\n');
    const analysis = analyzeAST(ast);
    
    console.log(`Functions: ${analysis.functions.length}`);
    if (analysis.functions.length > 0) {
      analysis.functions.forEach(f => {
        console.log(`  - ${f.name} (${f.params} params)${f.async ? ' [async]' : ''}`);
      });
    }
    
    console.log(`\nReact Components: ${analysis.components.length}`);
    if (analysis.components.length > 0) {
      analysis.components.forEach(c => {
        console.log(`  - ${c.name} (${c.type})`);
      });
    }
    
    console.log(`\nImports: ${analysis.imports.length}`);
    if (analysis.imports.length > 0) {
      analysis.imports.slice(0, 5).forEach(i => {
        console.log(`  - from "${i.source}": ${i.specifiers.join(', ')}`);
      });
      if (analysis.imports.length > 5) {
        console.log(`  ... and ${analysis.imports.length - 5} more`);
      }
    }
    
    console.log(`\nExports: ${analysis.exports.length}`);
    if (analysis.exports.length > 0) {
      analysis.exports.forEach(e => {
        console.log(`  - ${e.name} (${e.type})`);
      });
    }
    
    console.log(`\nVariables: ${analysis.variables.length}`);
    const constCount = analysis.variables.filter(v => v.kind === 'const').length;
    const letCount = analysis.variables.filter(v => v.kind === 'let').length;
    const varCount = analysis.variables.filter(v => v.kind === 'var').length;
    console.log(`  - const: ${constCount}, let: ${letCount}, var: ${varCount}`);
    
    console.log(`\nClasses: ${analysis.classes.length}`);
    if (analysis.classes.length > 0) {
      analysis.classes.forEach(c => {
        console.log(`  - ${c.name}${c.superClass ? ` extends ${c.superClass}` : ''}`);
      });
    }
  }
  
  if (shouldSave) {
    const outputPath = filePath.replace(/\.(ts|tsx|js|jsx)$/, '.ast.json');
    fs.writeFileSync(outputPath, JSON.stringify(ast, null, 2));
    console.log(`\n💾 AST saved to: ${path.relative(process.cwd(), outputPath)}`);
  }
  
  if (!shouldAnalyze && !shouldSave) {
    console.log('💡 Tip: Use --analyze to see detailed analysis or --save to save AST to file');
  }
}

main();
