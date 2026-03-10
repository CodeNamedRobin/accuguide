#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../dependency-graph.json'), 'utf8'));
const entries = Object.entries(data);
const totalModules = entries.length;
const totalInternalImports = entries.reduce((s, [, v]) => s + v.importCount, 0);
const totalExternalImports = entries.reduce((s, [, v]) => s + v.externalCount, 0);
const avgFanOut = (totalInternalImports / totalModules).toFixed(2);

// Calculate afferent coupling (fan-in) for each module
const fanIn = {};
entries.forEach(([mod, d]) => {
  d.imports.forEach(imp => {
    fanIn[imp] = (fanIn[imp] || 0) + 1;
  });
});

// Instability for each module: Ce/(Ca+Ce)
const instability = {};
entries.forEach(([mod, d]) => {
  const Ce = d.importCount; // efferent coupling
  const modBase = mod.replace(/\.(tsx?|jsx?)$/, '');
  const Ca = fanIn[modBase] || 0; // afferent coupling
  instability[mod] = { Ce, Ca, I: Ca + Ce > 0 ? (Ce / (Ca + Ce)).toFixed(2) : 'N/A' };
});

console.log('=== Coupling Metrics ===');
console.log('Total modules:', totalModules);
console.log('Total internal imports:', totalInternalImports);
console.log('Total external imports:', totalExternalImports);
console.log('Avg fan-out (efferent coupling):', avgFanOut);
console.log();

// Top unstable modules (I close to 1)
const sorted = Object.entries(instability)
  .filter(([, v]) => v.I !== 'N/A' && (v.Ca + v.Ce) > 2)
  .sort((a, b) => parseFloat(b[1].I) - parseFloat(a[1].I));

console.log('Most Unstable (I close to 1, high efferent, low afferent):');
sorted.slice(0, 10).forEach(([m, v]) => console.log('  ' + m, 'Ca=' + v.Ca, 'Ce=' + v.Ce, 'I=' + v.I));
console.log();

console.log('Most Stable (I close to 0, high afferent, low efferent):');
sorted.slice(-10).reverse().forEach(([m, v]) => console.log('  ' + m, 'Ca=' + v.Ca, 'Ce=' + v.Ce, 'I=' + v.I));

// Architectural layers analysis
const layers = { app: { count: 0, imports: 0, fanInTotal: 0 }, components: { count: 0, imports: 0, fanInTotal: 0 }, lib: { count: 0, imports: 0, fanInTotal: 0 }, contexts: { count: 0, imports: 0, fanInTotal: 0 }, api: { count: 0, imports: 0, fanInTotal: 0 } };
entries.forEach(([mod, d]) => {
  const modBase = mod.replace(/\.(tsx?|jsx?)$/, '');
  const ca = fanIn[modBase] || 0;
  if (mod.includes('app/api/')) { layers.api.count++; layers.api.imports += d.importCount; layers.api.fanInTotal += ca; }
  else if (mod.includes('app/')) { layers.app.count++; layers.app.imports += d.importCount; layers.app.fanInTotal += ca; }
  else if (mod.includes('components/')) { layers.components.count++; layers.components.imports += d.importCount; layers.components.fanInTotal += ca; }
  else if (mod.includes('lib/')) { layers.lib.count++; layers.lib.imports += d.importCount; layers.lib.fanInTotal += ca; }
  else if (mod.includes('contexts/')) { layers.contexts.count++; layers.contexts.imports += d.importCount; layers.contexts.fanInTotal += ca; }
});

console.log();
console.log('=== Architectural Layer Metrics ===');
Object.entries(layers).forEach(([l, v]) => {
  console.log(l + ':', 'modules=' + v.count, 'totalFanOut=' + v.imports, 'avgFanOut=' + (v.count > 0 ? (v.imports / v.count).toFixed(2) : '0'), 'totalFanIn=' + v.fanInTotal, 'avgFanIn=' + (v.count > 0 ? (v.fanInTotal / v.count).toFixed(2) : '0'));
});

// Comment-to-code ratio from code-metrics
const codeMetrics = JSON.parse(fs.readFileSync(path.join(__dirname, '../code-metrics-report.json'), 'utf8'));
console.log();
console.log('=== Size & Documentation Metrics ===');
console.log('Total files:', codeMetrics.totalFiles);
console.log('Total lines:', codeMetrics.totalLines);
console.log('Source lines (SLOC):', codeMetrics.totalSource);
console.log('Comment lines:', codeMetrics.totalComments);
console.log('Empty lines:', codeMetrics.totalEmpty);
console.log('Comment-to-code ratio:', (codeMetrics.totalComments / codeMetrics.totalSource * 100).toFixed(1) + '%');
console.log('Avg file size (SLOC):', (codeMetrics.totalSource / codeMetrics.totalFiles).toFixed(1));

// File size distribution
const fileSizes = codeMetrics.fileMetrics.map(f => f.source);
const small = fileSizes.filter(s => s <= 50).length;
const medium = fileSizes.filter(s => s > 50 && s <= 150).length;
const large = fileSizes.filter(s => s > 150 && s <= 300).length;
const veryLarge = fileSizes.filter(s => s > 300).length;
console.log();
console.log('File size distribution:');
console.log('  <= 50 SLOC:', small, '(' + (small / codeMetrics.totalFiles * 100).toFixed(1) + '%)');
console.log('  51-150 SLOC:', medium, '(' + (medium / codeMetrics.totalFiles * 100).toFixed(1) + '%)');
console.log('  151-300 SLOC:', large, '(' + (large / codeMetrics.totalFiles * 100).toFixed(1) + '%)');
console.log('  > 300 SLOC:', veryLarge, '(' + (veryLarge / codeMetrics.totalFiles * 100).toFixed(1) + '%)');
