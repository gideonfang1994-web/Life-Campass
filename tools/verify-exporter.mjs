/**
 * 独立 HTML 导出 —— 真实函数调用验证。
 *
 * 旧版只对模板做正则替换，验证不了插值逻辑（残留 ${...} 也不报错）。
 * 这里直接 import 编译后的 htmlExporter，喂真实夹具，检查产出物内容。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(process.argv[2] || '.');

async function loadTs(relPath) {
  const abs = path.join(ROOT, relPath);
  const outPath = path.join(ROOT, `.tmp-${relPath.replace(/[\\/]/g, '_')}.mjs`);
  // bundle 模式：把相对导入（./planReconciliation）一起打进产物，
  // 否则单文件转换后 import 路径会指向不存在的裸模块名。
  await build({
    entryPoints: [abs],
    outfile: outPath,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    loader: { '.ts': 'ts' },
    logLevel: 'silent',
  });
  return import(pathToFileURL(outPath).href + '?t=' + Date.now());
}

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ' —— ' + detail : ''}`);
  } else {
    fail++;
    failures.push(name + (detail ? ' —— ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`);
  }
}

// ---- 真实夹具 ----
const projects = [
  {
    id: 'p1', category: '工作', status: '进行中', title: '【工作杠杆】构建无许可代码与产品复利资产',
    description: '描述', progress: 70, nextMicroAction: '写第一版原型', dimension: 'career',
  },
  {
    id: 'p2', category: '健康', status: '进行中', title: '【健康基石】MAF180 低心率有氧',
    description: '', progress: 45, nextMicroAction: '', dimension: 'health',
  },
];

const logs = [{
  date: '2026-10-30', energyLevel: 4,
  highlight: '完成了SaaS产品定价方案的比较矩阵与文案定稿',
  wins: ['小胜A', '小胜B'], friction: '略有分心',
}];

const retros = [{ title: '第43周·人生进化战略复盘简报', content: '# 复盘\n内容' }];

const wheelScores = {
  career: 7, health: 6, relationships: 8, wealth: 5,
  growth: 7, environment: 6, fun: 5, meaning: 8,
};

const goals = [{
  id: 'g1', title: '产品化并变现',
  category: 'career',
  fiveYearVision: '做出被市场需要的产品',
  oneYearTarget: '月收入 10000 元',
  progress: 12,
  status: 'active',
  firstPrinciples: {
    fundamentalTruth: '用户不为想法付费',
    deletedProcesses: [],
    coreBottleneck: '没人买',
    unconventionalPath: '',
  },
  muskAlgorithm: {
    questionRequirement: true, deleteWaste: true, simplifyOptimize: true,
    accelerateCycle: false, automateLeverage: false,
  },
  milestones: [],
  supervision: {
    velocityScore: 40,
    paceEvaluation: 'linear_trap',
  },
}];

// 与 src/data/planSeedData.ts 结构一致的最小计划树
const planNodes = [
  {
    id: 'pn-y1', title: '年度：把副业跑成产品', cycle: 'year', periodKey: '2026',
    children: ['pn-q1'], parentId: undefined, dimension: 'career',
    plannedHours: 200, actualHours: 40, weight: 1, progress: 0,
    status: 'in_progress', deliverable: '可售卖的 V1 产品',
    successCriteria: '有真实付费用户', verificationProof: '',
    projectId: 'p1', goalId: 'g1', note: '', createdAt: '', updatedAt: '',
  },
  {
    id: 'pn-q1', title: 'Q4：完成 MVP 并拿到首批用户', cycle: 'quarter', periodKey: '2026-Q4',
    children: ['pn-m0'], parentId: 'pn-y1', dimension: 'career',
    plannedHours: 80, actualHours: 15, weight: 1, progress: 0,
    status: 'in_progress', deliverable: 'MVP 上线',
    successCriteria: '10 个种子用户', verificationProof: '',
    projectId: 'p1', goalId: '', note: '', createdAt: '', updatedAt: '',
  },
  {
    id: 'pn-m0', title: '10 月：打通核心链路', cycle: 'month', periodKey: '2026-10',
    children: ['pn-w1'], parentId: 'pn-q1', dimension: 'career',
    plannedHours: 40, actualHours: 10, weight: 1, progress: 0,
    status: 'in_progress', deliverable: '可点通的完整流程',
    successCriteria: '主流程无阻塞缺陷', verificationProof: '',
    projectId: 'p1', goalId: '', note: '', createdAt: '', updatedAt: '',
  },
  {
    id: 'pn-w1', title: 'W44：完成结算模块', cycle: 'week', periodKey: '2026-W44',
    children: ['pn-d1'], parentId: 'pn-m0', dimension: 'career',
    plannedHours: 20, actualHours: 2, weight: 1, progress: 0,
    status: 'in_progress', deliverable: '结算模块可跑通',
    successCriteria: '本地支付沙箱通过', verificationProof: '',
    projectId: 'p1', goalId: '', note: '', createdAt: '', updatedAt: '',
  },
  {
    id: 'pn-d1', title: '周一：写完支付回调', cycle: 'day', periodKey: '2026-10-26',
    children: [], parentId: 'pn-w1', dimension: 'career',
    plannedHours: 6, actualHours: 6, weight: 1, progress: 100,
    status: 'completed', deliverable: '回调代码 + 单测',
    successCriteria: '单测全绿', verificationProof: 'commit abc123',
    projectId: 'p1', goalId: '', note: '', createdAt: '', updatedAt: '',
  },
  {
    id: 'pn-d2', title: '周二：只做设计稿（刻意缺证据）', cycle: 'day', periodKey: '2026-10-27',
    children: [], parentId: 'pn-w1', dimension: 'career',
    plannedHours: 4, actualHours: 0, weight: 1, progress: 100,
    status: 'completed', deliverable: '设计稿',
    successCriteria: '设计评审通过', verificationProof: '',
    projectId: 'p1', goalId: '', note: '', createdAt: '', updatedAt: '',
  },
];

// ---- 量化健康夹具 ----
const healthEntries = [
  {
    id: 'h1', date: '2026-10-28', source: 'manual',
    sleepHours: 6.5, deepSleepHours: 1.2, remSleepHours: 1.6, lightSleepHours: 3.7,
    bedtimeMinutes: 1380, wakeTimeMinutes: 450, awakenCount: 1,
    exerciseMinutes: 40, steps: 8200, distanceKm: 5.8, caloriesBurned: 320,
    caloriesIntake: 2100, proteinG: 95, carbsG: 240, fatG: 60, waterMl: 2200,
    weightKg: 74.2, bodyFatPct: 21.5, restingHr: 60, systolic: 118, diastolic: 76,
    energyLevel: 4, note: '',
  },
  {
    id: 'h2', date: '2026-10-29', source: 'manual',
    sleepHours: 7.8, deepSleepHours: 1.6, remSleepHours: 1.9, lightSleepHours: 4.3,
    bedtimeMinutes: 1385, wakeTimeMinutes: 420, awakenCount: 0,
    exerciseMinutes: 55, steps: 11200, distanceKm: 7.9, caloriesBurned: 410,
    caloriesIntake: 2250, proteinG: 105, carbsG: 255, fatG: 62, waterMl: 2500,
    weightKg: 73.9, bodyFatPct: 21.3, restingHr: 58, systolic: 116, diastolic: 74,
    energyLevel: 4, note: '',
  },
  {
    id: 'h3', date: '2026-10-30', source: 'manual',
    sleepHours: 5.4, deepSleepHours: 0.8, remSleepHours: 1.1, lightSleepHours: 3.5,
    bedtimeMinutes: 1420, wakeTimeMinutes: 380, awakenCount: 2,
    exerciseMinutes: 20, steps: 4600, distanceKm: 3.1, caloriesBurned: 190,
    caloriesIntake: 2450, proteinG: 80, carbsG: 300, fatG: 70, waterMl: 1500,
    weightKg: 74.5, bodyFatPct: 21.8, restingHr: 66, systolic: 122, diastolic: 80,
    energyLevel: 2, note: '熬夜',
  },
  {
    id: 'h4', date: '2026-10-31', source: 'manual',
    sleepHours: 7.2, deepSleepHours: 1.4, remSleepHours: 1.7, lightSleepHours: 4.1,
    bedtimeMinutes: 1390, wakeTimeMinutes: 430, awakenCount: 1,
    exerciseMinutes: 35, steps: 7600, distanceKm: 5.2, caloriesBurned: 280,
    caloriesIntake: 2000, proteinG: 110, carbsG: 220, fatG: 58, waterMl: 2600,
    weightKg: 74.0, bodyFatPct: 21.4, restingHr: 59, systolic: 117, diastolic: 75,
    energyLevel: 4, note: '',
  },
];

const healthGoals = {
  targetSleepHours: 7.5,
  targetDeepSleepHours: 1.5,
  targetExerciseMinutes: 45,
  targetSteps: 10000,
  targetCaloriesIntake: 2200,
  targetProteinG: 100,
  targetWaterMl: 2500,
  targetWeightKg: 72,
  targetRestingHr: 60,
};

(async () => {
  const exporter = await loadTs('src/utils/htmlExporter.ts');

  console.log('\n════════ 独立 HTML 导出验证 ════════');

  check('导出器提供纯函数 buildStandaloneHtml', typeof exporter.buildStandaloneHtml === 'function');
  check('导出器保留文件下载函数', typeof exporter.exportStandaloneHtmlFile === 'function');

  const html = exporter.buildStandaloneHtml(projects, logs, wheelScores, retros, goals, planNodes);

  console.log('  导出长度        :', html.length);
  console.log('  残留模板变量    :', (html.match(/\$\{[^}]+\}/g) || []).join(' | ') || '无');

  check('含项目标题', html.includes('工作杠杆'));
  check('含日志高光', html.includes('完成了SaaS产品定价方案'));
  check('含复盘标题', html.includes('第43周'));
  check('含计划板标题', html.includes('日 / 周 / 月 / 季 / 年'));
  check('含年度节点标题', html.includes('年度：把副业跑成产品'));
  check('含季度节点标题', html.includes('Q4：完成 MVP 并拿到首批用户'));
  check('含月度节点标题', html.includes('10 月：打通核心链路'));
  check('含周度节点标题', html.includes('W44：完成结算模块'));
  check('含日级节点标题', html.includes('周一：写完支付回调'));
  check('含计划健康度', html.includes('计划健康度'));
  check('含勾稽诊断分区', html.includes('勾稽诊断'));
  check('含各周期层进度', html.includes('各周期层进度'));
  check('含计划树分区', html.includes('计划树'));
  check('含 5X 目标关联', html.includes('产品化并变现'));
  check('含 5X 目标年度指标', html.includes('月收入 10000 元'));
  check('含生命项目关联名称', html.includes('构建无许可代码与产品复利资产'));
  check('含工时缺口提示', html.includes('工时'));
  check('含完成缺证据提示', html.includes('证据'));
  check('无 undefined 残留', !html.includes('undefined'));
  check('无未替换模板变量', (html.match(/\$\{[^}]+\}/g) || []).length === 0);
  check('结构完整', html.includes('</html>') && html.includes('<body') && html.includes('lucide.createIcons()'));
  check('计划板分区在 main 内', html.indexOf('日 / 周 / 月 / 季 / 年') > html.indexOf('<main') && html.indexOf('日 / 周 / 月 / 季 / 年') < html.indexOf('</main>'));

  // 空计划板时不应报错，且要给出友好提示
  const emptyHtml = exporter.buildStandaloneHtml(projects, logs, wheelScores, retros, goals, []);
  check('空计划板不崩溃', typeof emptyHtml === 'string' && emptyHtml.length > 1000);
  check('空计划板有提示文案', emptyHtml.includes('五级计划板') || emptyHtml.includes('计划'));

  // ============ 量化健康导出区块 ============
  console.log('\n════════ 量化健康导出区块 ════════');

  const healthHtml = exporter.buildStandaloneHtml(
    projects, logs, wheelScores, retros, goals, planNodes, healthEntries, healthGoals
  );

  check('含健康区块标题', healthHtml.includes('量化健康记录与分析'));
  check('含健康记录天数', healthHtml.includes('4 天'));
  check('含健康评分', healthHtml.includes('健康评分'));
  check('含记录覆盖率', healthHtml.includes('记录覆盖率'));
  check('含记录天数指标', healthHtml.includes('记录天数'));
  check('含异常提示指标', healthHtml.includes('异常提示'));
  check('含周维度评分趋势', healthHtml.includes('周维度评分趋势'));
  check('含分析洞察', healthHtml.includes('分析洞察'));
  check('含指标相关性', healthHtml.includes('指标相关性'));
  check('含异常检测', healthHtml.includes('异常检测'));
  check('含最近 14 天明细', healthHtml.includes('最近 14 天明细'));
  check('含明细日期', healthHtml.includes('2026-10-31'));
  check('含睡眠数值', healthHtml.includes('7.2'));
  check('健康区块在 main 内',
    healthHtml.indexOf('量化健康记录与分析') > healthHtml.indexOf('<main') &&
    healthHtml.indexOf('量化健康记录与分析') < healthHtml.indexOf('</main>'));
  check('健康导出无 undefined 残留', !healthHtml.includes('undefined'));
  check('健康导出无未替换模板变量', (healthHtml.match(/\$\{[^}]+\}/g) || []).length === 0);

  // 空健康数据不崩溃
  const noHealthHtml = exporter.buildStandaloneHtml(
    projects, logs, wheelScores, retros, goals, planNodes, [], healthGoals
  );
  check('空健康数据不崩溃', typeof noHealthHtml === 'string' && noHealthHtml.length > 1000);
  check('空健康数据有提示文案', noHealthHtml.includes('暂无健康记录'));
  check('空健康数据仍含健康区块标题', noHealthHtml.includes('量化健康记录与分析'));

  // 健康数据不影响计划板区块
  check('健康导出仍含计划板', healthHtml.includes('日 / 周 / 月 / 季 / 年'));
  check('健康导出仍含 5X 目标', healthHtml.includes('产品化并变现'));

  console.log('\n════════════════════════════════════');
  console.log(`  通过 ${pass} 项 / 失败 ${fail} 项`);
  if (failures.length) {
    console.log('\n  失败明细：');
    failures.forEach((f) => console.log('   · ' + f));
  }
  console.log('════════════════════════════════════');

  // 清理临时编译产物
  fs.readdirSync(ROOT)
    .filter((f) => f.startsWith('.tmp-') && f.endsWith('.mjs'))
    .forEach((f) => { try { fs.unlinkSync(path.join(ROOT, f)); } catch {} });

  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('执行异常：', err);
  process.exit(1);
});
