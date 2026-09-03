import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublishedAgreement, normalizePublishedAgreement } from './agreementService';

const { mockAxios } = vi.hoisted(() => ({
  mockAxios: {
    get: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

describe('agreementService', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
    mockAxios.isAxiosError.mockReset();
    mockAxios.isAxiosError.mockReturnValue(false);
  });

  it('normalizes a published privacy agreement payload', () => {
    const agreement = normalizePublishedAgreement('privacy', {
      code: 200,
      msg: 'ok',
      data: {
        title: '隐私协议',
        content: '<p>一、信息收集</p><p>必要信息说明。</p>',
        version: 'v2',
      },
    });

    expect(agreement).toEqual({
      title: '隐私协议',
      content: '<p>一、信息收集</p><p>必要信息说明。</p>',
      version: 'v2',
    });
  });

  it('falls back to the kind-based title when data is a plain string', () => {
    const agreement = normalizePublishedAgreement('service', {
      data: '服务协议正文',
    });

    expect(agreement).toEqual({
      title: '服务协议',
      content: '服务协议正文',
      version: undefined,
    });
  });

  it('throws when the agreement content is missing', () => {
    expect(() => normalizePublishedAgreement('privacy', { data: {} })).toThrow('协议内容为空');
  });

  it('fetches the published agreement with the requested type', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        msg: 'ok',
        data: { title: '隐私协议', content: '当前生效的隐私协议内容' },
      },
    });

    const agreement = await fetchPublishedAgreement('privacy');

    expect(mockAxios.get).toHaveBeenCalledTimes(1);
    expect(agreement.content).toBe('当前生效的隐私协议内容');
    expect(agreement.title).toBe('隐私协议');
  });

  it('rethrows backend business errors with the server message', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: { code: 500, msg: '协议尚未发布' },
    });

    await expect(fetchPublishedAgreement('service')).rejects.toThrow('协议尚未发布');
  });

  it('surfaces axios network errors with a friendly message', async () => {
    mockAxios.get.mockRejectedValueOnce({ response: { data: { msg: '网络异常' } } });
    mockAxios.isAxiosError.mockReturnValue(true);

    await expect(fetchPublishedAgreement('privacy')).rejects.toThrow('网络异常');
  });
});
