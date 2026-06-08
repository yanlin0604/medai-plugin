import { LinkOutlined } from '@ant-design/icons';
import { BS_WORKSPACE_URL_TEMPLATE, WRITEBACK_MODE_LABEL } from '../../services/writebackConfig';

export default function Settings() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">设置</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-[15px] font-bold text-[#1E3A8A] border-b-2 border-[#1E3A8A] pb-1.5 inline-block">
          回写方式与目标
        </h2>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <LinkOutlined />
            <span>{WRITEBACK_MODE_LABEL}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-emerald-700/80">
            AI 成稿会写入 BS 演示系统的回写收件箱，正在编辑的病历页面会自动同步刷新。
          </p>
        </div>

        <label className="block">
          <span className="block text-sm font-bold text-slate-700 mb-1.5">BS 工作台目标</span>
          <textarea
            readOnly
            value={BS_WORKSPACE_URL_TEMPLATE}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600 outline-none"
          />
        </label>
      </section>
    </div>
  );
}
