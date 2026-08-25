export type AgreementKind = 'privacy' | 'service';

interface LegalAgreementModalProps {
  kind: AgreementKind;
  onClose: () => void;
}

export default function LegalAgreementModal({ kind, onClose }: LegalAgreementModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-5"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="legal-agreement-title"
        aria-modal="true"
        className="max-h-[76vh] w-full max-w-[440px] overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="legal-agreement-title" className="text-sm font-bold text-slate-900">
            {kind === 'privacy' ? '隐私协议' : '服务协议'}
          </h2>
          <button
            aria-label="关闭协议"
            className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="custom-scrollbar max-h-[58vh] overflow-y-auto px-5 py-4 text-xs leading-6 text-slate-600">
          {kind === 'privacy' ? (
            <>
              <p className="font-bold text-slate-800">一、信息收集</p>
              <p>为完成账号登录、权限校验和病历书写服务，系统可能处理账号、姓名、科室、角色以及业务操作记录等必要信息。</p>
              <p className="mt-3 font-bold text-slate-800">二、信息使用</p>
              <p>相关信息仅用于身份认证、功能授权、系统运行和安全审计，不会超出医疗业务场景使用。</p>
              <p className="mt-3 font-bold text-slate-800">三、信息保护</p>
              <p>系统将按照医院信息安全管理要求采取访问控制、传输保护和日志审计等措施。涉及患者的信息应仅用于授权的诊疗工作。</p>
            </>
          ) : (
            <>
              <p className="font-bold text-slate-800">一、服务内容</p>
              <p>本系统为医疗人员提供病历书写辅助、查房记录整理及相关工作流支持，具体功能以当前版本为准。</p>
              <p className="mt-3 font-bold text-slate-800">二、使用规范</p>
              <p>用户应使用本人账号登录，妥善保管账号密码，并在授权范围内使用系统，不得擅自共享账号或越权访问医疗信息。</p>
              <p className="mt-3 font-bold text-slate-800">三、责任说明</p>
              <p>系统生成内容仅作为书写辅助，不能替代医生的专业判断。提交或回写病历前，用户应完成必要的核对、修改和确认。</p>
            </>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <button
            className="rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554]"
            onClick={onClose}
            type="button"
          >
            我知道了
          </button>
        </div>
      </section>
    </div>
  );
}
