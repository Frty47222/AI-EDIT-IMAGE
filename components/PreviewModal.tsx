
import React, { useState, useEffect, useCallback } from 'react';
import { ProcessedImage } from '../types';

interface PreviewModalProps {
  image: ProcessedImage;
  initialType: 'original' | 'edited';
  onClose: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ image, initialType, onClose }) => {
  const [viewType, setViewType] = useState<'original' | 'edited'>(initialType);

  // 键盘快捷键监听
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft') {
      setViewType('original');
    } else if (e.key === 'ArrowRight' && image.editedUrl) {
      setViewType('edited');
    }
  }, [image.editedUrl, onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const currentUrl = viewType === 'original' ? image.originalUrl : image.editedUrl || image.originalUrl;
  const currentTitle = viewType === 'original' ? '原图版本' : '修改后版本';

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md" />
      
      {/* Content Container */}
      <div 
        className="relative z-10 w-full h-full flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header/Controls */}
        <div className="w-full flex flex-col md:flex-row justify-between items-center p-4 gap-4">
          <div className="flex flex-col">
            <h3 className="text-white font-bold text-lg leading-tight">{image.originalName}</h3>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
              {currentTitle} {image.editedUrl ? '• 使用 ← → 键对比' : ''}
            </p>
          </div>

          {/* Toggle Tabs */}
          {image.editedUrl && (
            <div className="bg-slate-900/80 p-1 rounded-xl border border-slate-800 flex items-center shadow-inner">
              <button 
                onClick={() => setViewType('original')}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  viewType === 'original' 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <i className="fa-solid fa-image"></i>
                原图
              </button>
              <button 
                onClick={() => setViewType('edited')}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  viewType === 'edited' 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                效果图
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <a 
              href={currentUrl} 
              download={`${viewType === 'original' ? '原图' : '修改'}-${image.originalName}`}
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-all active:scale-95 border border-slate-700"
              title="下载当前版本"
            >
              <i className="fa-solid fa-download"></i>
            </a>
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-all active:scale-95 border border-slate-700"
            >
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="flex-1 w-full flex items-center justify-center overflow-hidden relative group">
          {/* Key Hints Overlay (Small) */}
          {image.editedUrl && (
             <div className="absolute inset-y-0 left-0 w-24 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 rounded-full bg-white/5 backdrop-blur flex items-center justify-center text-white/20">
                   <i className="fa-solid fa-chevron-left"></i>
                </div>
             </div>
          )}
          {image.editedUrl && (
             <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 rounded-full bg-white/5 backdrop-blur flex items-center justify-center text-white/20">
                   <i className="fa-solid fa-chevron-right"></i>
                </div>
             </div>
          )}

          <img 
            key={viewType} 
            src={currentUrl} 
            alt={currentTitle} 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          />
        </div>
        
        {/* Comparison Hint Footer */}
        {image.editedUrl && (
          <div className="pb-8 text-slate-600 text-[10px] font-medium uppercase tracking-[0.2em]">
            按左方向键查看原图 • 右方向键查看效果图
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewModal;
