import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '../../LifeCompass.html');
const h = fs.readFileSync(file, 'utf8');

const re = /step:\s*["']?(\d+)/g;
const counts = {};
let m;
while ((m = re.exec(h))) counts[m[1]] = (counts[m[1]] || 0) + 1;
console.log('step 属性统计:', JSON.stringify(counts));

// 定位出勤进度输入框附近的上下文
const idxs = [];
let p = -1;
while ((p = h.indexOf('step:', p + 1)) !== -1) idxs.push(p);
console.log('step: 出现次数:', idxs.length);
for (const i of idxs) {
  console.log('---', h.slice(Math.max(0, i - 160), i + 40).replace(/\n/g, ' '));
}

// 检查 AI 层是否含 ReferenceError 容错（Proxy 作用域）
console.log('含 Proxy 作用域:', /new Proxy\(base/.test(h));
