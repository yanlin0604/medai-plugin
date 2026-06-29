import { useState } from 'react';
import { Drawer, Button, Checkbox, Tag } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, RobotOutlined } from '@ant-design/icons';

interface DiarizationSegment {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export interface AudioBlock {
  id: string;
  timestamp: string;
  segments: DiarizationSegment[];
}

// 模拟后端返回的全病区查房大录音片段（未绑定具体患者）
const MOCK_BLOCKS: AudioBlock[] = [
  {
    id: 'block-1',
    timestamp: '09:12',
    segments: [
      { id: '1', start: 0, end: 5, speaker: '说话人 1', text: '12床，今天感觉怎么样？咳嗽好点了吗？' },
      { id: '2', start: 6, end: 10, speaker: '说话人 2', text: '咳嗽好多了，就是晚上还有点。' },
      { id: '3', start: 11, end: 15, speaker: '说话人 1', text: '好，那我们继续雾化和抗感染治疗，氧饱和度我看维持在95左右，挺好的。' },
    ]
  },
  {
    id: 'block-2',
    timestamp: '09:18',
    segments: [
      { id: '4', start: 120, end: 125, speaker: '说话人 1', text: '下一个，15床。昨天的血糖查了没？' },
      { id: '5', start: 126, end: 130, speaker: '说话人 3', text: '空腹是8.2。' },
      { id: '6', start: 131, end: 138, speaker: '说话人 1', text: '还是偏高，胰岛素稍微加2个单位。' }
    ]
  },
  {
    id: 'block-3',
    timestamp: '09:25',
    segments: [
      { id: '7', start: 600, end: 605, speaker: '说话人 1', text: '对了12床，昨天复查的血常规白细胞下来了。' }
    ]
  }
];

interface RoundSegmentSelectorProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  onImport: (generatedText: string) => void;
}

export default function RoundSegmentSelector({
  open,
  onClose,
  patientName,
  onImport
}: RoundSegmentSelectorProps) {
  // 不做患者过滤，直接展示所有全区录音块
  const blocks = MOCK_BLOCKS;
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const toggleSelect = (blockId: string) => {
    setSelectedBlockIds(prev => 
      prev.includes(blockId) ? prev.filter(i => i !== blockId) : [...prev, blockId]
    );
  };

  const togglePlay = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
    } else {
      setPlayingId(id);
      setTimeout(() => {
        setPlayingId(prev => (prev === id ? null : prev));
      }, 3000);
    }
  };

  const handleGenerate = () => {
    if (selectedBlockIds.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      // 真实场景下会将选中的片段发送给大模型提取
      const fakeAiResult = '患者诉咳嗽较前明显好转，夜间偶有咳嗽。查体：SpO2维持在95%左右。近期复查血常规示白细胞计数下降。处理：继续当前雾化吸入及抗感染治疗，密切观察病情变化。';
      onImport(fakeAiResult);
      onClose();
    }, 1500);
  };

  return (
    <Drawer
      title={<span>导入查房记录 - <b>{patientName}</b></span>}
      placement="right"
      size="default"
      onClose={onClose}
      open={open}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>
            取消
          </Button>
          <Button 
            type="primary" 
            icon={<RobotOutlined />} 
            onClick={handleGenerate}
            loading={generating}
            disabled={selectedBlockIds.length === 0}
          >
            AI 提取所选内容
          </Button>
        </div>
      }
    >
      <div className="mb-4 rounded-lg bg-orange-50 p-3 text-xs text-orange-700 border border-orange-200">
        以下是最近的病区查房语音片段。请人工核对并勾选属于 <b>{patientName}</b> 的内容，AI 将为您一键提取。
      </div>

      <div className="space-y-4">
        {blocks.map((block, index) => {
          const isSelected = selectedBlockIds.includes(block.id);
          const isPlaying = playingId === block.id;

          return (
            <div 
              key={block.id} 
              className={`rounded-lg border-2 p-3 transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Checkbox 
                  checked={isSelected}
                  onChange={() => toggleSelect(block.id)}
                >
                  <span className="font-semibold text-slate-800">
                    片段 {index + 1} <span className="text-slate-400 font-normal text-xs ml-1">({block.timestamp})</span>
                  </span>
                </Checkbox>
                <Button 
                  type="text" 
                  size="small" 
                  icon={isPlaying ? <PauseCircleOutlined className="text-blue-500" /> : <PlayCircleOutlined />}
                  onClick={() => togglePlay(block.id)}
                  className={isPlaying ? "text-blue-500 bg-blue-50" : ""}
                >
                  {isPlaying ? '试听中...' : '试听'}
                </Button>
              </div>
              
              <div className="space-y-2 mt-3 bg-slate-50 border border-slate-100 p-2 rounded max-h-32 overflow-y-auto">
                {block.segments.map(seg => (
                  <div key={seg.id} className="text-xs leading-relaxed">
                    <Tag bordered={false} color={['blue', 'green', 'orange', 'purple'][parseInt(seg.speaker.replace(/[^0-9]/g, '') || '0') % 4]}>{seg.speaker}</Tag>
                    <span className="text-slate-700">{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
