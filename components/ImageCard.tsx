
import React from 'react';
import { ProcessedImage } from '../types';

interface ImageCardProps {
  image: ProcessedImage;
  onPreview: (type: 'original' | 'edited') => void;
  onToggleSelect: (id: string) => void;
  onGenerateSingle: () => void;
}

const ImageCard: React.FC<ImageCardProps> = ({ image, onPreview, onToggleSelect, onGenerateSingle }) => {
  const isProcessing = image.status === 'processing';

  const handleCardClick = () => {
    if (isProcessing) return;
    onToggleSelect(image.id);
  };

  const statusMap = {
    'completed': '已完成',
    'processing': '处理中',
    'error': '错误',
    'pending': '待处理'
  };

  return (
    <div 
      onClick={handleCardClick}
      className={`glass rounded-xl overflow-hidden flex flex-col h-full border transition-all relative group/card cursor-pointer select-none ${
        image.selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-700 hover:border-slate-500'
      } ${isProcessing ? 'opacity-90 cursor-wait' : ''}`}
    >
      {/* 状态复选框 */}
      <div className="absolute top-3 left-3 z-20">
        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
          image.selected 
          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/40' 
          : 'bg-slate-900/80 border-slate-600 text-transparent'
        }`}>
          <i className="fa-solid fa-check text-[10px]"></i>
        </div>
      </div>

      {/* 头部信息区 */}
      <div className="p-3 pl-10 border-b border-slate-700 flex justify-between items-center bg-slate-800/40">
        <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px]" title={image.originalName}>
          {image.originalName}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${
          image.status === 'completed' ? 'bg-green-500/20 text-green-400' :
          image.status === 'processing' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
          image.status === 'error' ? 'bg-red-500/20 text-red-400' :
          'bg-slate-700/50 text-slate-400'
        }`}>
          {statusMap[image.status]}
        </span>
      </div>
      
      {/* 内容展示区 */}
      <div className="flex-1 grid grid-cols-2 gap-px bg-slate-700/50">
        {/* 左侧：原图 */}
        <div 
          className="relative aspect-square bg-slate-900 group/img cursor-zoom-in overflow-hidden"
          onClick={(e) => {
            e.stopPropagation();
            onPreview('original');
          }}
        >
          <img 
            src={image.originalUrl} 
            alt="原图" 
            className="w-full h-full object-contain p-1 transition-transform group-hover/img:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
            <i className="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-lg"></i>
          </div>
          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] uppercase tracking-wider font-bold z-10">原图</div>
        </div>
        
        {/* 右侧：生成图/状态 */}
        <div className="relative aspect-square bg-slate-900 overflow-hidden flex flex-col items-center justify-center p-2">
          {image.status === 'completed' && image.editedUrl ? (
            <div 
              className="w-full h-full relative group/img cursor-zoom-in"
              onClick={(e) => {
                e.stopPropagation();
                onPreview('edited');
              }}
            >
              <img 
                src={image.editedUrl} 
                alt="效果图" 
                className="w-full h-full object-contain p-1 transition-transform group-hover/img:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                <i className="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-lg"></i>
              </div>
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-blue-600/80 rounded text-[9px] uppercase tracking-wider font-bold z-10">效果图</div>
            </div>
          ) : image.status === 'error' ? (
            <div className="flex flex-col items-center justify-center text-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-red-500 text-lg"></i>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateSingle();
                }}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95"
              >
                重试
              </button>
              <p className="text-[8px] text-red-400/60 leading-tight max-w-[80px] truncate">{image.error}</p>
            </div>
          ) : image.status === 'processing' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className="fa-solid fa-bolt text-blue-400 text-[10px]"></i>
                </div>
              </div>
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">执行中</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3">
              <span className="text-slate-600 text-[10px] italic font-medium uppercase tracking-tighter">就绪</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateSingle();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                执行
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* 底部操作区 */}
      {image.status === 'completed' && image.editedUrl && (
        <div className="p-2 bg-slate-800/20 flex justify-end border-t border-slate-700/50 gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onGenerateSingle();
            }}
            className="text-[10px] flex items-center gap-2 text-slate-400 hover:text-blue-400 hover:bg-blue-600/10 transition-all px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700 font-bold uppercase tracking-wider"
            title="使用当前指令重新生成此图片"
          >
            <i className="fa-solid fa-arrows-rotate"></i> 重新生成
          </button>
          <a 
            href={image.editedUrl} 
            download={`gmi-${image.originalName.replace(/\.[^/.]+$/, "")}.png`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] flex items-center gap-2 text-blue-400 hover:text-white hover:bg-blue-600 transition-all px-3 py-1.5 rounded-lg bg-blue-600/10 font-bold uppercase tracking-wider"
          >
            <i className="fa-solid fa-download"></i> 保存
          </a>
        </div>
      )}
    </div>
  );
};

export default ImageCard;
