interface Props {
  visible: boolean;
  text: string;
}

/**
 * 防串户双向锁熔断警报条（猩红脉冲）。
 * 对应需求"全局组件：防串户熔断机制——检测HIS与AI侧患者不一致时锁死回写通道"。
 */
export default function MeltdownAlert({ visible, text }: Props) {
  if (!visible) return null;
  return (
    <div className="bg-[#FFE4E6] border-[1.5px] border-[#F43F5E] text-[#9F1239] p-3 rounded-lg text-xs leading-[1.6] font-bold animate-red-pulse">
      {text}
    </div>
  );
}
