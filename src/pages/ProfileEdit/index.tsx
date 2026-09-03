import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CameraOutlined,
  SaveOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import {
  getProfile,
  resolveAvatarDisplayUrl,
  updateProfile,
  uploadProfileAvatar,
  type ProfileUpdateRequest,
} from '../../services/authService';
import { useAuthStore } from '../../stores/useAuthStore';

const T = {
  back: '返回个人中心',
  title: '修改个人资料',
  subtitle: '更新你的姓名、科室、职称和头像',
  avatar: '医生头像',
  avatarHint: '支持 JPG、PNG，最大 2MB',
  account: '账号',
  name: '姓名',
  deptCode: '科室编码',
  titleLabel: '职称',
  namePlaceholder: '请输入姓名',
  deptPlaceholder: '请输入科室编码',
  cancel: '取消',
  save: '保存资料',
  saving: '保存中...',
  chooseImage: '请选择图片文件',
  imageSize: '头像图片不能超过 2MB',
  imageUploadSuccess: '头像上传成功',
  imageUploadFailed: '头像上传失败',
  loadFailed: '个人资料加载失败',
  saveSuccess: '个人资料已保存',
  saveFailed: '个人资料保存失败',
  empty: '未设置',
};

const titleOptions = [
  '',
  '住院医师',
  '主治医师',
  '副主任医师',
  '主任医师',
  '护士',
  '其他',
];

export default function ProfileEdit() {
  const navigate = useNavigate();
  const userInfo = useAuthStore((state) => state.userInfo);
  const setUserInfo = useAuthStore((state) => state.setUserInfo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(userInfo?.userName ?? '');
  const [deptCode, setDeptCode] = useState(userInfo?.deptCode ?? '');
  const [title, setTitle] = useState(userInfo?.title ?? '');
  const [avatar, setAvatar] = useState(userInfo?.avatar ?? '');
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarOssId, setAvatarOssId] = useState<string | undefined>(userInfo?.avatarOssId);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    let active = true;
    setAvatarDisplayUrl('');
    void resolveAvatarDisplayUrl(avatar)
      .then((url) => {
        if (active) setAvatarDisplayUrl(url);
      })
      .catch(() => {
        if (active) setAvatarDisplayUrl('');
      });

    return () => {
      active = false;
    };
  }, [avatar]);

  if (!userInfo) return null;

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.warning(T.chooseImage);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.warning(T.imageSize);
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
    setAvatarUploading(true);
    void uploadProfileAvatar(file)
      .then(async (result) => {
        setAvatarOssId(result.avatarOssId);
        const remoteAvatar = result.avatar ?? result.avatarUrl ?? result.url ?? result.fileUrl;
        if (remoteAvatar) {
          setAvatar(remoteAvatar);
          setAvatarPreview('');
        } else {
          const profile = await getProfile(userInfo);
          setAvatar(profile.avatar ?? '');
          setAvatarPreview('');
        }
        message.success(T.imageUploadSuccess);
      })
      .catch((error) => {
        setAvatarPreview('');
        message.error(error instanceof Error ? error.message : T.imageUploadFailed);
      })
      .finally(() => setAvatarUploading(false));
  };

  const handleSave = async () => {
    if (name.trim().length > 30) {
      message.warning('姓名不能超过 30 个字符');
      return;
    }
    if (deptCode.trim().length > 100) {
      message.warning('科室编码不能超过 100 个字符');
      return;
    }
    if (title.trim().length > 50) {
      message.warning('职称不能超过 50 个字符');
      return;
    }
    setSaving(true);
    try {
      const request: ProfileUpdateRequest = {
        userName: name.trim(),
        // deptCode: deptCode.trim(),
        title: title.trim(),
      };
      if (avatarOssId !== undefined) request.avatarOssId = avatarOssId;

      const profile = await updateProfile(request, {
        ...userInfo,
        userName: name.trim(),
        // deptCode: deptCode.trim(),
        title: title.trim() || undefined,
        avatar,
        avatarOssId,
      });
      setUserInfo(profile);
      message.success(T.saveSuccess);
      navigate('/profile', { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : T.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F6F8FB]">
      <div className="mx-auto w-full max-w-2xl px-5 py-5">
        <div className="mb-4 flex items-center gap-3">
          <button
            aria-label={T.back}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            onClick={() => navigate('/profile')}
            title={T.back}
            type="button"
          >
            <ArrowLeftOutlined />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{T.title}</h1>
            <p className="mt-1 text-xs text-slate-500">{T.subtitle}</p>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center border-b border-slate-100 pb-5">
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-4 border-blue-50 bg-[#EAF1FF] text-4xl font-bold text-[#1E3A8A]">
                {avatarPreview || avatarDisplayUrl ? (
                  <img
                    alt={T.avatar}
                    className="h-full w-full object-cover"
                    src={avatarPreview || avatarDisplayUrl}
                  />
                ) : (
                  name.slice(0, 1) || <UserOutlined />
                )}
              </div>
              <button
                aria-label={T.avatar}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#1E3A8A] text-white shadow-md hover:bg-[#172554] disabled:opacity-50"
                disabled={avatarUploading}
                onClick={() => fileInputRef.current?.click()}
                title={T.avatar}
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
            <span className="mt-3 text-[11px] text-slate-400">
              {avatarUploading ? '\u5934\u50cf\u4e0a\u4f20\u4e2d...' : T.avatarHint}
            </span>
          </div>

          <div className="space-y-4 pt-5">
            <ReadOnlyField label={T.account} value={userInfo.userId || T.empty} />
            <EditField label={T.name} value={name} onChange={setName} placeholder={T.namePlaceholder} />
            {/* <EditField
              label={T.deptCode}
              value={deptCode}
              onChange={setDeptCode}
              placeholder={T.deptPlaceholder}
            /> */}
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">{T.titleLabel}</span>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-[#1E3A8A] focus:bg-white focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              >
                {titleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option || T.empty}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              onClick={() => navigate('/profile')}
              type="button"
            >
              {T.cancel}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554] disabled:opacity-60"
              disabled={saving || avatarUploading}
              onClick={() => void handleSave()}
              type="button"
            >
              <SaveOutlined />
              {saving ? T.saving : T.save}
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
      <div className="flex h-10 items-center rounded-md border border-slate-100 bg-slate-50 px-3 text-sm text-slate-700">
        {value}
      </div>
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
