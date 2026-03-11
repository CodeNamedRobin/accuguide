#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sloc = require('sloc');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const srcDir = path.join(__dirname, '../src');

const metrics = {
  totalFiles: 0,
  totalLines: 0,
  totalSource: 0,
  totalComments: 0,
  totalEmpty: 0,
  fileMetrics: [],
  complexityByFile: [],
};

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

function calculateCyclomaticComplexity(code) {
  let complexity = 1;
  let functions = 0;

  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  traverse(ast, {
    Function() {
      functions++;
    },
    IfStatement() {
      complexity++;
    },
    ForStatement() {
      complexity++;
    },
    ForInStatement() {
      complexity++;
    },
    ForOfStatement() {
      complexity++;
    },
    WhileStatement() {
      complexity++;
    },
    DoWhileStatement() {
      complexity++;
    },
    SwitchCase(path) {
      if (path.node.test) complexity++;
    },
    CatchClause() {
      complexity++;
    },
    LogicalExpression(path) {
      if (path.node.operator === '&&' || path.node.operator === '||') {
        complexity++;
      }
    },
    ConditionalExpression() {
      complexity++;
    }
  });

  return { complexity, functions };
}

function analyzeFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);
    const relativePath = path.relative(srcDir, filePath);

    let slocStats;

    try {
      const language = ext === '.tsx' || ext === '.jsx' ? 'jsx' : 'js';
      slocStats = sloc(code, language);
    } catch (e) {
      slocStats = {
        total: code.split('\n').length,
        source: code.split('\n').length,
        comment: 0,
        empty: 0
      };
    }

    metrics.totalFiles++;
    metrics.totalLines += slocStats.total;
    metrics.totalSource += slocStats.source;
    metrics.totalComments += slocStats.comment;
    metrics.totalEmpty += (slocStats.empty || 0);

    try {
      const result = calculateCyclomaticComplexity(code);

      metrics.complexityByFile.push({
        file: relativePath,
        cyclomatic: result.complexity,
        functions: result.functions,
        lines: slocStats.source,
        maintainability: 'N/A'
      });

    } catch (err) {
      console.log(`⚠️ Complexity failed for ${relativePath}`);
    }

    metrics.fileMetrics.push({
      file: relativePath,
      lines: slocStats.total,
      source: slocStats.source,
      comments: slocStats.comment,
      empty: slocStats.empty || 0,
    });

  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
  }
}

console.log('🔍 Analyzing codebase metrics...\n');

walkDirectory(srcDir, analyzeFile);

metrics.complexityByFile.sort((a, b) => b.cyclomatic - a.cyclomatic);

const avgCyclomatic =
  metrics.complexityByFile.length > 0
    ? (
        metrics.complexityByFile.reduce((sum, f) => sum + f.cyclomatic, 0) /
        metrics.complexityByFile.length
      ).toFixed(2)
    : 0;

const totalFunctions =
  metrics.complexityByFile.reduce((sum, f) => sum + f.functions, 0);

console.log('📊 Code Metrics Summary');
console.log('═══════════════════════════════════════');
console.log(`Total Files:           ${metrics.totalFiles}`);
console.log(`Total Lines:           ${metrics.totalLines.toLocaleString()}`);
console.log(`Source Lines:          ${metrics.totalSource.toLocaleString()}`);
console.log(`Comment Lines:         ${metrics.totalComments.toLocaleString()}`);
console.log(`Empty Lines:           ${metrics.totalEmpty.toLocaleString()}`);
console.log(`Avg Lines per File:    ${(metrics.totalLines / metrics.totalFiles).toFixed(0)}`);
console.log();

console.log('🔬 Complexity Metrics');
console.log('═══════════════════════════════════════');
console.log(`Files Analyzed:        ${metrics.complexityByFile.length}`);
console.log(`Avg Cyclomatic:        ${avgCyclomatic}`);
console.log(`Total Functions:       ${totalFunctions}`);
console.log();

console.log('📈 Most Complex Files (Top 10)');
console.log('═══════════════════════════════════════');

metrics.complexityByFile.slice(0, 10).forEach((file, i) => {
  console.log(`${i + 1}. ${file.file}`);
  console.log(`   Cyclomatic: ${file.cyclomatic}, Functions: ${file.functions}, Lines: ${file.lines}`);
});

console.log();

console.log('📁 Largest Files (Top 10)');
console.log('═══════════════════════════════════════');

metrics.fileMetrics
  .sort((a, b) => b.source - a.source)
  .slice(0, 10)
  .forEach((file, i) => {
    console.log(`${i + 1}. ${file.file}`);
    console.log(`   Source: ${file.source}, Comments: ${file.comments}, Empty: ${file.empty}`);
  });

const reportPath = path.join(__dirname, '../code-metrics-report.json');

fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));

console.log();
console.log(`✅ Detailed report saved to: code-metrics-report.json`);