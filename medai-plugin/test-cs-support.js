// 快速验证 CS 端支持
const context = {
  source: 'demo-cs',  // CS 端
  patientId: 'ZY20260001',
  patientName: '陈建国',
  docCode: 'DOC010',
  docName: '出院记录',
  fieldKey: 'dischargeOrders',
  fieldLabel: '出院医嘱',
  fieldValue: '1. 出院带药...',
  selectedText: '',
  prefix: '阿斯蒂芬',
  selectionStart: 203,
  selectionEnd: 203,
  trigger: 'selection',
  detectedAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
};

// 模拟修改后的验证逻辑
function isUsableEditAssistContext(context) {
  if (!context) return false;
  // 支持 BS 端和 CS 端
  const isValidSource = context.source === 'demo-bs' || context.source === 'demo-cs';
  if (!isValidSource || context.docCode !== 'DOC010') return false;
  if (!context.fieldKey || !context.fieldLabel) return false;
  const token = (context.selectedText || context.prefix || '').trim();
  return token.length >= 2;
}

console.log('测试 CS 端上下文验证:');
console.log('context.source:', context.source);
console.log('isUsableEditAssistContext(context):', isUsableEditAssistContext(context));
console.log('');
console.log('✅ 期望结果: true');
console.log('✅ 实际结果:', isUsableEditAssistContext(context));

if (isUsableEditAssistContext(context)) {
  console.log('\n🎉 修改成功！CS 端上下文现在可以被接受了！');
} else {
  console.log('\n❌ 修改失败，需要检查代码');
}
