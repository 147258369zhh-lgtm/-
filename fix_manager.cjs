const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src/components/AbilityManager.tsx');
let lines = fs.readFileSync(targetPath, 'utf8').split('\n');

const newLogic = fs.readFileSync('fix_p1.txt', 'utf8').replace(/\r\n/g, '\n');
const newFlow = fs.readFileSync('fix_p2.txt', 'utf8').replace(/\r\n/g, '\n');

const searchStr1 = "'1. Optimize user description into a professional Agent description (Chinese)'";
const endStr1 = "console.warn('AI flow generation failed:', aiErr);";
const searchStr2 = "//  Step 2: Generate flow nodes from AI-selected tools ";
const endStr2 = "setEdges(generatedEdges);";

const startIdx1 = lines.findIndex(l => l.includes(searchStr1));
const endIdx1 = lines.findIndex(l => l.includes(endStr1)) + 2;
const startIdx2 = lines.findIndex(l => l.includes(searchStr2));
const endIdx2 = lines.findIndex(l => l.includes(endStr2)) + 1;

if (startIdx1 !== -1 && endIdx1 > startIdx1 && startIdx2 !== -1 && endIdx2 > startIdx2) {
  lines.splice(startIdx2, endIdx2 - startIdx2, newFlow);
  lines.splice(startIdx1 - 1, endIdx1 - startIdx1 + 1, newLogic);
  fs.writeFileSync(targetPath, lines.join('\n'), 'utf8');
  console.log("Success!");
} else {
  console.log("Indices failed: ", startIdx1, endIdx1, startIdx2, endIdx2);
}
