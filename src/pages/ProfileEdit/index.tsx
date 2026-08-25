import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  SaveOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { useAuthStore } from '../../stores/useAuthStore';

const titleOptions = ['住院医师', '主治医师', '副主任医师', '主任医师', '护士', '其他'];

export default function ProfileEdit() {
  const navigate = useNavigate();
  const userInfo = useAuthStore((state) => state.userInfo);
  const setUserInfo = useAuthStore((state) => state.setUserInfo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(userInfo?.userName ?? '');
  const [deptName, setDeptName] = useState(userInfo?.deptName ?? '');
  const [title, setTitle] = useState(userInfo?.title ?? '主治医师');
  const [avatar, setAvatar] = useState(userInfo?.avatar ?? '');
  const [saving, setSaving] = useState(false);

  if (!userInfo) return null;

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.warning('请选择图片文件。');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.warning('头像图片不能超过 2MB。');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name.trim() || !deptName.trim()) {
      message.warning('请填写姓名和科室。');
      return;
    }

    setSaving(true);
    setUserInfo({
      ...userInfo,
      userName: name.trim(),
      deptName: deptName.trim(),
      title,
      avatar,
    });
    setSaving(false);
    message.success('个人资料已保存。');
    navigate('/profile', { replace: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F6F8FB]">
      <div className="mx-auto w-full max-w-2xl px-5 py-5">
        <div className="mb-4 flex items-center gap-3">
          <button
            aria-label="返回个人中心"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            onClick={() => navigate('/profile')}
            title="返回个人中心"
            type="button"
          >
            <ArrowLeftOutlined />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">修改个人资料</h1>
            <p className="mt-1 text-xs text-slate-500">更新你的姓名、科室、职称和头像</p>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center border-b border-slate-100 pb-5">
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-4 border-blue-50 bg-[#EAF1FF] text-4xl font-bold text-[#1E3A8A]">
                {avatar ? (
                  <img alt="医生头像" className="h-full w-full object-cover" src={avatar} />
                ) : (
                  name.slice(0, 1) || <UserOutlined />
                )}
              </div>
              <button
                aria-label="更换头像"
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#1E3A8A] text-white shadow-md hover:bg-[#172554]"
                onClick={() => fileInputRef.current?.click()}
                title="更换头像"
                type="button"
              >
                <CameraOutlined className="text-sm" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
              type="file"
            />
            <span className="mt-3 text-[11px] text-slate-400">支持 JPG、PNG，最大 2MB</span>
          </div>

          <div className="space-y-4 pt-5">
            <ReadOnlyField label="账号" value={userInfo.userId} />
            <EditField label="姓名" value={name} onChange={setName} placeholder="请输入姓名" />
            <EditField label="科室" value={deptName} onChange={setDeptName} placeholder="请输入科室" />
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">职称</span>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-[#1E3A8A] focus:bg-white focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              >
                {titleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              onClick={() => navigate('/profile')}
              type="button"
            >
              取消
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554] disabled:opacity-60"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              <SaveOutlined />
              保存资料
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      <div className="flex h-10 items-center rounded-md border border-slate-100 bg-slate-50 px-3 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-[#1E3A8A] focus:bg-white focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
