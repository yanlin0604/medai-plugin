import { useState, useEffect } from 'react';
import { Drawer, Button, Checkbox, Tag, Tabs } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, RobotOutlined, ReloadOutlined } from '@ant-design/icons';

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
  group: 'assigned' | 'unassigned';
  status?: 'pending' | 'applied' | 'ignored';
}

interface RoundSegmentSelectorProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onImport: (payload: { selectedTexts: string; assignedIds: number[]; unassignedIds: number[] }) => void;
  assignedSegments?: Array<{
    id: number;
    transcribeText: string;
    alignTimestamp?: string;
    status?: 'pending' | 'applied' | 'ignored';
  }>;
  unassignedSegments?: Array<{
    id: number;
    transcribeText: string;
    alignTimestamp?: string;
    status?: 'pending' | 'applied' | 'ignored';
  }>;
}

export default function RoundSegmentSelector({
  open,
  onClose,
  patientName,
  onRefresh,
  refreshing,
  onImport,
  assignedSegments,
  unassignedSegments
}: RoundSegmentSelectorProps) {
  const blocks: AudioBlock[] = [
    ...(assignedSegments ?? []).map((seg) => ({
      id: String(seg.id),
      timestamp: seg.alignTimestamp || '已归属',
      group: 'assigned' as const,
      status: seg.status,
      segments: [
        { id: String(seg.id), start: 0, end: 0, speaker: '查房片段', text: seg.transcribeText }
      ]
    })),
    ...(unassignedSegments ?? []).map((seg) => ({
      id: String(seg.id),
      timestamp: seg.alignTimestamp || '未归属',
      group: 'unassigned' as const,
      status: seg.status,
      segments: [
        { id: String(seg.id), start: 0, end: 0, speaker: '查房片段', text: seg.transcribeText }
      ]
    })),
  ];
  const assignedBlocks = blocks.filter((block) => block.group === 'assigned');
  const unassignedBlocks = blocks.filter((block) => block.group === 'unassigned');

  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedBlockIds, setExpandedBlockIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('assigned');

  useEffect(() => {
    if (open) {
      if (assignedBlocks.length === 0 && unassignedBlocks.length > 0) {
        setActiveTab('unassigned');
      } else {
        setActiveTab('assigned');
      }
    }
  }, [open, assignedBlocks.length, unassignedBlocks.length]);

  const renderBlock = (block: AudioBlock, indexLabel: string) => {
    const isSelected = selectedBlockIds.includes(block.id);
    const isPlaying = playingId === block.id;
    const isExpanded = expandedBlockIds.includes(block.id);
    const blockText = block.segments
      .map((seg) => seg.text.trim())
      .filter(Boolean)
      .join(' ');
    let statusText = '未归属';
    let tagColor = 'orange';

    if (block.status === 'ignored') {
      statusText = '已忽略';
      tagColor = 'default';
    } else if (block.group === 'assigned') {
      if (block.status === 'applied') {
        statusText = '已自动采纳';
        tagColor = 'blue';
      } else {
        statusText = '待自动生成';
        tagColor = 'geekblue';
      }
    }

    return (
      <div
        key={block.id}
        className={`py-2 px-1 transition-colors ${
          isSelected ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'
        }`}
      >
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onChange={() => toggleSelect(block.id)}
            className="mt-1 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => toggleSelect(block.id)}
              className="w-full text-left"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-slate-800">{indexLabel}</span>
                <span className="text-[11px] font-medium text-slate-400">{block.timestamp}</span>
                <Tag className="!m-0" color={tagColor}>
                  {statusText}
                </Tag>
              </div>
              <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-600">
                {blockText}
              </div>
            </button>

            {isExpanded && (
              <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
                {block.segments.map((seg) => (
                  <div key={seg.id} className="text-xs leading-relaxed">
                    <Tag bordered={false} color="geekblue">{seg.speaker}</Tag>
                    <span className="text-slate-700">{seg.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 self-start">
            <Button
              type="text"
              size="small"
              icon={isPlaying ? <PauseCircleOutlined className="text-blue-500" /> : <PlayCircleOutlined />}
              onClick={() => togglePlay(block.id)}
              className={isPlaying ? 'text-blue-500 bg-blue-50' : ''}
            >
              {isPlaying ? '试听中' : '试听'}
            </Button>
            <Button type="text" size="small" onClick={() => toggleExpand(block.id)}>
              {isExpanded ? '收起' : '展开'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

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

  const toggleExpand = (blockId: string) => {
    setExpandedBlockIds((prev) =>
      prev.includes(blockId) ? prev.filter((id) => id !== blockId) : [...prev, blockId]
    );
  };

  const handleGenerate = () => {
    if (selectedBlockIds.length === 0) return;
    setGenerating(true);

    const selectedBlocks = blocks.filter((block) => selectedBlockIds.includes(block.id));
    const assignedIds = selectedBlocks
      .filter((block) => block.group === 'assigned')
      .map((block) => Number(block.id))
      .filter((id) => !Number.isNaN(id));
    const unassignedIds = selectedBlocks
      .filter((block) => block.group === 'unassigned')
      .map((block) => Number(block.id))
      .filter((id) => !Number.isNaN(id));

    const selectedTexts = selectedBlocks
      .flatMap((block) => block.segments.map((seg) => seg.text))
      .join('\n');

    setTimeout(() => {
      setGenerating(false);
      onImport({ selectedTexts, assignedIds, unassignedIds });
      setSelectedBlockIds([]);
      setExpandedBlockIds([]);
      onClose();
    }, 1000);
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
          <span>导入查房记录 - <b>{patientName}</b></span>
          {onRefresh && (
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              title="刷新"
            />
          )}
        </div>
      }
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
      <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
        以下是本次查房中与 <b>{patientName}</b> 相关的已归属片段，以及当前仍未归属的片段。请人工勾选后重新生成病程字段。
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'assigned',
            label: `已归属片段 (${assignedBlocks.length})`,
            children: (
              <div className="pt-1">
                {assignedBlocks.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {assignedBlocks.map((block, index) => renderBlock(block, `已归属片段 ${index + 1}`))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">
                    当前患者暂无可重选的已归属查房片段。
                  </div>
                )}
              </div>
            )
          },
          {
            key: 'unassigned',
            label: `未归属片段 (${unassignedBlocks.length})`,
            children: (
              <div className="pt-1">
                {unassignedBlocks.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {unassignedBlocks.map((block, index) => renderBlock(block, `未归属片段 ${index + 1}`))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-xs text-slate-400">
                    当前没有待认领的未归属查房片段。
                  </div>
                )}
              </div>
            )
          }
        ]}
      />
    </Drawer>
  );
}
