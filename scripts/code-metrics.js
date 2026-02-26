#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const escomplex = require('escomplex');
const sloc = require('sloc');

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

function analyzeFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);
    const relativePath = path.relative(srcDir, filePath);
    
    // Count lines
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
    
    // Complexity analysis
    let complexity = null;
    try {
      // Remove JSX and TypeScript syntax for complexity analysis
      let cleanCode = code
        .replace(/<[^>]*>/g, '') // Remove JSX
        .replace(/:\s*\w+(\[\])?/g, '') // Remove type annotations
        .replace(/import\s+type\s+/g, 'import ') // Remove type imports
        .replace(/<.*?>/g, ''); // Remove generics
      
      const result = escomplex.analyse(cleanCode);
      complexity = {
        maintainability: result.aggregate.maintainability.toFixed(2),
        cyclomatic: result.aggregate.cyclomatic,
        functions: result.functions.length,
        avgComplexity: result.functions.length > 0 
          ? (result.functions.reduce((sum, f) => sum + f.cyclomatic, 0) / result.functions.length).toFixed(2)
          : 0,
      };
      
      metrics.complexityByFile.push({
        file: relativePath,
        ...complexity,
        lines: slocStats.source
      });
    } catch (e) {
      // Complexity analysis failed, skip it
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

// Sort by complexity
metrics.complexityByFile.sort((a, b) => b.cyclomatic - a.cyclomatic);

// Calculate averages
const avgMaintainability = metrics.complexityByFile.length > 0
  ? (metrics.complexityByFile.reduce((sum, f) => sum + parseFloat(f.maintainability), 0) / metrics.complexityByFile.length).toFixed(2)
  : 0;

const avgCyclomatic = metrics.complexityByFile.length > 0
  ? (metrics.complexityByFile.reduce((sum, f) => sum + f.cyclomatic, 0) / metrics.complexityByFile.length).toFixed(2)
  : 0;

// Print summary
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
console.log(`Avg Maintainability:   ${avgMaintainability}/100`);
console.log(`Avg Cyclomatic:        ${avgCyclomatic}`);
console.log(`Total Functions:       ${metrics.complexityByFile.reduce((sum, f) => sum + f.functions, 0)}`);
console.log();

console.log('📈 Most Complex Files (Top 10)');
console.log('═══════════════════════════════════════');
metrics.complexityByFile.slice(0, 10).forEach((file, i) => {
  console.log(`${i + 1}. ${file.file}`);
  console.log(`   Cyclomatic: ${file.cyclomatic}, Maintainability: ${file.maintainability}, Functions: ${file.functions}, Lines: ${file.lines}`);
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

// Save detailed report
const reportPath = path.join(__dirname, '../code-metrics-report.json');
fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
console.log();
console.log(`✅ Detailed report saved to: code-metrics-report.json`);
