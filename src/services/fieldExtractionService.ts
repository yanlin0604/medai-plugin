/**
 * 实时字段提取服务
 *
 * 职责：
 * - 管理两个 WebSocket 连接（Python ASR + Java 后台）
 * - 会话初始化和生命周期管理
 * - 接收 ASR 识别文本并转发给 Java 后台
 * - 接收字段更新并触发回调
 */

export interface FieldExtractionConfig {
  sessionId: string;
  docCode: string;
  patientId: number;
  patientIdHis?: string;
  preFilledFields?: Record<string, any>;
  asrWebSocketUrl: string;  // Python ASR WebSocket 地址
  javaWebSocketUrl: string; // Java 后台 WebSocket 地址
}

export interface DialogTurn {
  speaker: string;
  text: string;
  timestamp: number;
}

export interface FieldUpdate {
  action: 'update_fields';
  session_id: string;
  fields: Record<string, any>;
  confidence: number;
}

export type FieldUpdateCallback = (fields: Record<string, any>, confidence: number) => void;
export type ErrorCallback = (error: string) => void;

/**
 * 实时字段提取服务
 */
export class FieldExtractionService {
  private config: FieldExtractionConfig;
  private wsAsr: WebSocket | null = null;
  private wsJava: WebSocket | null = null;
  private fieldUpdateCallbacks: FieldUpdateCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private isConnected = false;

  constructor(config: FieldExtractionConfig) {
    this.config = config;
  }

  /**
   * 连接并初始化会话
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 连接 Python ASR WebSocket
      this.wsAsr = new WebSocket(this.config.asrWebSocketUrl);

      this.wsAsr.onopen = () => {
        console.log('[FieldExtraction] ASR WebSocket 连接成功');

        // 连接 Java 后台 WebSocket
        this.wsJava = new WebSocket(this.config.javaWebSocketUrl);

        this.wsJava.onopen = () => {
          console.log('[FieldExtraction] Java WebSocket 连接成功');

          // 初始化会话
          this.initSession();
          this.isConnected = true;
          resolve();
        };

        this.wsJava.onerror = (error) => {
          console.error('[FieldExtraction] Java WebSocket 错误:', error);
          this.handleError('Java WebSocket 连接失败');
          reject(error);
        };

        this.wsJava.onmessage = (event) => {
          this.handleJavaMessage(event.data);
        };

        this.wsJava.onclose = () => {
          console.log('[FieldExtraction] Java WebSocket 连接关闭');
          this.isConnected = false;
        };
      };

      this.wsAsr.onerror = (error) => {
        console.error('[FieldExtraction] ASR WebSocket 错误:', error);
        this.handleError('ASR WebSocket 连接失败');
        reject(error);
      };

      this.wsAsr.onmessage = (event) => {
        this.handleAsrMessage(event.data);
      };

      this.wsAsr.onclose = () => {
        console.log('[FieldExtraction] ASR WebSocket 连接关闭');
        this.isConnected = false;
      };
    });
  }

  /**
   * 初始化会话
   */
  private initSession(): void {
    if (!this.wsJava || this.wsJava.readyState !== WebSocket.OPEN) {
      return;
    }

    const initMessage = {
      action: 'init_session',
      session_id: this.config.sessionId,
      doc_code: this.config.docCode,
      patient_id: this.config.patientId,
      patient_id_his: this.config.patientIdHis,
      pre_filled_fields: this.config.preFilledFields || {},
    };

    this.wsJava.send(JSON.stringify(initMessage));
    console.log('[FieldExtraction] 会话初始化消息已发送', initMessage);
  }

  /**
   * 处理 ASR 识别消息
   */
  private handleAsrMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // 只转发最终结果（is_final=true）
      if (message.is_final && message.text && message.text.trim()) {
        this.forwardToJava(message);
      }
    } catch (error) {
      console.error('[FieldExtraction] 解析 ASR 消息失败:', error);
    }
  }

  /**
   * 转发识别文本给 Java 后台
   */
  private forwardToJava(asrMessage: any): void {
    if (!this.wsJava || this.wsJava.readyState !== WebSocket.OPEN) {
      console.warn('[FieldExtraction] Java WebSocket 未连接，无法转发消息');
      return;
    }

    const textMessage = {
      action: 'text_message',
      session_id: this.config.sessionId,
      text: asrMessage.text,
      speaker: asrMessage.speaker || '未知',
      timestamp: Date.now(),
    };

    this.wsJava.send(JSON.stringify(textMessage));
    console.log('[FieldExtraction] 转发文本给 Java:', textMessage.text);
  }

  /**
   * 处理 Java 后台消息
   */
  private handleJavaMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.action) {
        case 'session_initialized':
          console.log('[FieldExtraction] 会话初始化成功');
          break;

        case 'update_fields':
          this.handleFieldUpdate(message);
          break;

        case 'error':
          this.handleError(message.message);
          break;

        case 'session_closed':
          console.log('[FieldExtraction] 会话已关闭');
          break;

        default:
          console.warn('[FieldExtraction] 未知消息类型:', message.action);
      }
    } catch (error) {
      console.error('[FieldExtraction] 解析 Java 消息失败:', error);
    }
  }

  /**
   * 处理字段更新
   */
  private handleFieldUpdate(message: FieldUpdate): void {
    if (message.fields && Object.keys(message.fields).length > 0) {
      console.log('[FieldExtraction] 收到字段更新:', message.fields);

      // 触发所有回调
      this.fieldUpdateCallbacks.forEach(callback => {
        try {
          callback(message.fields, message.confidence);
        } catch (error) {
          console.error('[FieldExtraction] 字段更新回调执行失败:', error);
        }
      });
    }
  }

  /**
   * 处理错误
   */
  private handleError(errorMessage: string): void {
    console.error('[FieldExtraction] 错误:', errorMessage);
    this.errorCallbacks.forEach(callback => {
      try {
        callback(errorMessage);
      } catch (error) {
        console.error('[FieldExtraction] 错误回调执行失败:', error);
      }
    });
  }

  /**
   * 注册字段更新回调
   */
  onFieldUpdate(callback: FieldUpdateCallback): void {
    this.fieldUpdateCallbacks.push(callback);
  }

  /**
   * 注册错误回调
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.wsJava && this.wsJava.readyState === WebSocket.OPEN) {
      // 发送关闭会话消息
      this.wsJava.send(JSON.stringify({
        action: 'close_session',
        session_id: this.config.sessionId,
      }));
    }

    // 关闭 WebSocket 连接
    if (this.wsAsr) {
      this.wsAsr.close();
      this.wsAsr = null;
    }

    if (this.wsJava) {
      this.wsJava.close();
      this.wsJava = null;
    }

    this.isConnected = false;
    console.log('[FieldExtraction] 已断开所有连接');
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): boolean {
    return this.isConnected;
  }
}
