#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const srcDir = path.join(__dirname, '../src');
const dependencyGraph = {};
const allModules = new Set();

/**
 * Resolve import path to actual file path
 */
function resolveImportPath(importSource, currentFilePath) {
  // Handle @/ alias (maps to src/)
  if (importSource.startsWith('@/')) {
    return importSource.replace('@/', 'src/');
  }
  
  // Handle relative imports
  if (importSource.startsWith('.')) {
    const currentDir = path.dirname(currentFilePath);
    const resolved = path.normalize(path.join(currentDir, importSource));
    return resolved;
  }
  
  // External package (node_modules)
  return null;
}

/**
 * Parse a file and extract its imports
 */
function extractImports(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);
    
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        ext === '.tsx' ? 'tsx' : null,
        'classProperties',
        'decorators-legacy',
        'dynamicImport',
      ].filter(Boolean)
    });
    
    const imports = [];
    const externalImports = [];
    
    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        const resolved = resolveImportPath(source, filePath);
        
        if (resolved) {
          // Internal import
          imports.push({
            source: source,
            resolved: resolved,
            specifiers: path.node.specifiers.map(s => s.local.name)
          });
        } else {
          // External import
          externalImports.push(source);
        }
      },
      
      // Handle dynamic imports
      CallExpression(path) {
        if (path.node.callee.type === 'Import' && path.node.arguments[0]) {
          const source = path.node.arguments[0].value;
          if (source) {
            const resolved = resolveImportPath(source, filePath);
            if (resolved) {
              imports.push({
                source: source,
                resolved: resolved,
                dynamic: true,
                specifiers: []
              });
            }
          }
        }
      }
    });
    
    return { imports, externalImports };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return { imports: [], externalImports: [] };
  }
}

/**
 * Walk directory and collect all files
 */
function walkDirectory(dir, callback) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDirectory(filePath, callback);
    } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(file) && !file.endsWith('.d.ts')) {
      callback(filePath);
    }
  });
}

/**
 * Build the dependency graph
 */
function buildDependencyGraph() {
  console.log('🔍 Analyzing module dependencies...\n');
  
  const externalDependencies = new Set();
  
  walkDirectory(srcDir, (filePath) => {
    const relativePath = path.relative(process.cwd(), filePath);
    allModules.add(relativePath);
    
    const { imports, externalImports } = extractImports(filePath);
    
    dependencyGraph[relativePath] = {
      imports: imports.map(imp => imp.resolved),
      importDetails: imports,
      externalImports: externalImports,
      importCount: imports.length,
      externalCount: externalImports.length
    };
    
    externalImports.forEach(ext => externalDependencies.add(ext));
  });
  
  return externalDependencies;
}

/**
 * Find modules that depend on a given module
 */
function findDependents(targetModule) {
  const dependents = [];
  
  // Remove extension from target for comparison
  const targetWithoutExt = targetModule.replace(/\.(tsx?|jsx?)$/, '');
  
  for (const [module, data] of Object.entries(dependencyGraph)) {
    if (data.imports.some(imp => {
      // Check if import matches the target module (with or without extension)
      return imp === targetWithoutExt || imp === targetModule;
    })) {
      dependents.push(module);
    }
  }
  
  return dependents;
}

/**
 * Calculate module metrics
 */
function calculateMetrics() {
  const metrics = {
    totalModules: allModules.size,
    mostImported: [],
    mostDependencies: [],
    isolated: [],
    circular: []
  };
  
  // Find most imported modules (most dependents)
  const importCounts = {};
  allModules.forEach(module => {
    importCounts[module] = findDependents(module).length;
  });
  
  metrics.mostImported = Object.entries(importCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([module, count]) => ({ module, dependents: count }));
  
  // Find modules with most dependencies
  metrics.mostDependencies = Object.entries(dependencyGraph)
    .map(([module, data]) => ({ module, imports: data.importCount }))
    .sort((a, b) => b.imports - a.imports)
    .slice(0, 10);
  
  // Find isolated modules (no imports, no dependents)
  metrics.isolated = Array.from(allModules).filter(module => {
    const deps = dependencyGraph[module];
    const dependents = findDependents(module);
    return deps.importCount === 0 && dependents.length === 0;
  });
  
  return metrics;
}

/**
 * Find actual module file from import path (without extension)
 */
function findModuleFile(importPath) {
  // Try common extensions
  const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
  
  for (const ext of extensions) {
    const fullPath = importPath + ext;
    if (allModules.has(fullPath)) {
      return fullPath;
    }
  }
  
  return null;
}

/**
 * Generate DOT format for Graphviz
 */
function generateDotFormat(limit = 50) {
  let dot = 'digraph DependencyGraph {\n';
  dot += '  rankdir=LR;\n';
  dot += '  node [shape=box, style=rounded, fontname="Arial"];\n';
  dot += '  edge [color="#666666"];\n\n';
  
  // Only include top modules by importance
  const topModules = new Set();
  const metrics = calculateMetrics();
  
  metrics.mostImported.slice(0, limit / 2).forEach(m => topModules.add(m.module));
  metrics.mostDependencies.slice(0, limit / 2).forEach(m => topModules.add(m.module));
  
  // First pass: define all nodes
  topModules.forEach(module => {
    const label = path.basename(module, path.extname(module));
    const dir = path.dirname(module).split('/').slice(-2).join('/');
    const nodeId = module.replace(/[/.]/g, '_').replace(/-/g, '_');
    
    dot += `  ${nodeId} [label="${label}\\n(${dir})"];\n`;
  });
  
  dot += '\n';
  
  // Second pass: create edges
  topModules.forEach(module => {
    const data = dependencyGraph[module];
    const nodeId = module.replace(/[/.]/g, '_').replace(/-/g, '_');
    
    data.imports.forEach(imp => {
      // Find the actual module file
      const impModule = findModuleFile(imp);
      
      if (impModule && topModules.has(impModule)) {
        const impId = impModule.replace(/[/.]/g, '_').replace(/-/g, '_');
        dot += `  ${nodeId} -> ${impId};\n`;
      }
    });
  });
  
  dot += '}\n';
  return dot;
}

/**
 * Main function
 */
function main() {
  const externalDeps = buildDependencyGraph();
  const metrics = calculateMetrics();
  
  console.log('📊 Dependency Graph Summary');
  console.log('═══════════════════════════════════════');
  console.log(`Total Modules:         ${metrics.totalModules}`);
  console.log(`External Packages:     ${externalDeps.size}`);
  console.log(`Isolated Modules:      ${metrics.isolated.length}`);
  console.log();
  
  console.log('🔥 Most Imported Modules (Top 10)');
  console.log('═══════════════════════════════════════');
  metrics.mostImported.forEach((item, i) => {
    console.log(`${i + 1}. ${item.module}`);
    console.log(`   Used by ${item.dependents} modules`);
  });
  console.log();
  
  console.log('📦 Modules with Most Dependencies (Top 10)');
  console.log('═══════════════════════════════════════');
  metrics.mostDependencies.forEach((item, i) => {
    console.log(`${i + 1}. ${item.module}`);
    console.log(`   Imports ${item.imports} modules`);
  });
  console.log();
  
  console.log('📚 Most Used External Packages (Top 15)');
  console.log('═══════════════════════════════════════');
  const externalCounts = {};
  Object.values(dependencyGraph).forEach(data => {
    data.externalImports.forEach(ext => {
      // Get package name (ignore subpaths)
      const pkg = ext.startsWith('@') 
        ? ext.split('/').slice(0, 2).join('/')
        : ext.split('/')[0];
      externalCounts[pkg] = (externalCounts[pkg] || 0) + 1;
    });
  });
  
  Object.entries(externalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([pkg, count], i) => {
      console.log(`${i + 1}. ${pkg} (used ${count} times)`);
    });
  
  // Save detailed graph
  const graphPath = path.join(__dirname, '../dependency-graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(dependencyGraph, null, 2));
  console.log();
  console.log(`✅ Full dependency graph saved to: dependency-graph.json`);
  
  // Save DOT format for visualization
  const dotPath = path.join(__dirname, '../dependency-graph.dot');
  const dotContent = generateDotFormat(50);
  fs.writeFileSync(dotPath, dotContent);
  console.log(`✅ Graphviz DOT file saved to: dependency-graph.dot`);
  console.log();
  console.log('💡 To visualize: Install Graphviz and run:');
  console.log('   dot -Tpng dependency-graph.dot -o dependency-graph.png');
  console.log('   or visit: http://www.webgraphviz.com/ and paste the DOT content');
}

main();
