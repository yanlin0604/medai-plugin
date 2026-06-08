import { useState } from 'react';
import { Segmented, message } from 'antd';
import {
  DEFAULT_WRITEBACK_CONFIG,
  WritebackConfig,
  WritebackMode,
  getWritebackConfig,
  saveWritebackConfig,
} from '../../services/writebackConfig';

export default function Settings() {
  const [config, setConfig] = useState<WritebackConfig>(() => getWritebackConfig());

  const handleSave = (draft: WritebackConfig) => {
    saveWritebackConfig(draft);
    setConfig(draft);
    message.success('配置已保存');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">设置</h1>
      
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <h2 className="text-[15px] font-bold text-[#1E3A8A] border-b-2 border-[#1E3A8A] pb-1.5 inline-block">
          回写方式与目标
        </h2>

        <label className="block">
          <span className="block text-sm font-bold text-slate-700 mb-2">回写方式</span>
          <Segmented
            block
            value={config.mode}
            onChange={(value) => handleSave({ ...config, mode: value as WritebackMode })}
            options={[
              { label: 'BS附着(推荐)', value: 'bs-attached' },
              { label: 'CS自动', value: 'cs-auto' },
              { label: '顺序粘贴', value: 'clipboard' },
            ]}
            className="mb-2"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            {config.mode === 'bs-attached' && '附着到已打开的 Chrome 调试会话，匹配当前 BS 页面后直接填入。'}
            {config.mode === 'cs-auto' && '定位桌面窗口后执行桌面回写。'}
            {config.mode === 'clipboard' && '弹出手工复制助手，供医生逐字段顺序核对粘贴。'}
          </p>
        </label>

        {config.mode === 'bs-attached' && (
          <>
            <label className="block">
              <span className="block text-sm font-bold text-slate-700 mb-1.5">BS URL 模板</span>
              <textarea
                value={config.bsUrlTemplate}
                onChange={(event) => setConfig({ ...config, bsUrlTemplate: event.target.value })}
                onBlur={() => handleSave(config)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500"
              />
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                通过 {'{patientId}'} 和 {'{docCode}'} 决定要打开的患者页面和文书表单。
              </p>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-bold text-slate-700 mb-1.5">ChromeDriver 地址</span>
                <input
                  value={config.bsWebDriverUrl}
                  onChange={(event) => setConfig({ ...config, bsWebDriverUrl: event.target.value })}
                  onBlur={() => handleSave(config)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-bold text-slate-700 mb-1.5">Chrome 调试地址</span>
                <input
                  value={config.bsDebuggerAddress}
                  onChange={(event) => setConfig({ ...config, bsDebuggerAddress: event.target.value })}
                  onBlur={() => handleSave(config)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
            </div>
          </>
        )}

        {config.mode === 'cs-auto' && (
          <label className="block">
            <span className="block text-sm font-bold text-slate-700 mb-1.5">CS 窗口标题</span>
            <input
              value={config.csWindowTitle}
              onChange={(event) => setConfig({ ...config, csWindowTitle: event.target.value })}
              onBlur={() => handleSave(config)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={() => handleSave(DEFAULT_WRITEBACK_CONFIG)}
            className="text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            恢复默认配置
          </button>
        </div>
      </section>
    </div>
  );
}
