
import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { ProcessedImage, WorkflowConfig } from './types';
import { editImage } from './services/gemini';
import ImageCard from './components/ImageCard';
import PreviewModal from './components/PreviewModal';

const MODEL_OPTIONS = [
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', desc: '快速高效 (使用环境密钥)' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', desc: '高质量 (需要手动选择密钥)' },
];

const RESOLUTION_OPTIONS = ['1K', '2K', '4K'] as const;

const DEFAULT_PROMPT = `1.将图片上的文字翻译成俄文并替换
2.不改变产品形状
3.不改变字体颜色`;

const App: React.FC = () => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [config, setConfig] = useState<WorkflowConfig>({
    prompt: DEFAULT_PROMPT,
    model: 'gemini-2.5-flash-image',
    imageSize: '1K'
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [previewData, setPreviewData] = useState<{ image: ProcessedImage; initialType: 'original' | 'edited' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkApiKeyRequirement = async () => {
    if (config.model.includes('gemini-3-pro')) {
      // @ts-ignore
      if (typeof window.aistudio?.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          // @ts-ignore
          await window.aistudio.openSelectKey();
        }
      }
    }
    return true;
  };

  const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: ProcessedImage[] = (Array.from(files) as File[])
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        originalName: file.name,
        originalUrl: URL.createObjectURL(file),
        status: 'pending',
        selected: true
      }));

    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelect = (id: string) => {
    setImages(prev => prev.map(img => 
      img.id === id ? { ...img, selected: !img.selected } : img
    ));
  };

  const selectAll = (selected: boolean) => {
    setImages(prev => prev.map(img => ({ ...img, selected })));
  };

  const fileToBase64 = (url: string): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject('无法创建画布上下文');
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve({
          base64: dataUrl.split(',')[1],
          mimeType: 'image/png'
        });
      };
      img.onerror = () => reject('图片加载失败');
      img.src = url;
    });
  };

  const processOne = async (target: ProcessedImage) => {
    setImages(prev => prev.map(img => 
      img.id === target.id ? { ...img, status: 'processing', error: undefined } : img
    ));

    try {
      const { base64, mimeType } = await fileToBase64(target.originalUrl);
      const editedUrl = await editImage(base64, mimeType, config.prompt, config.model, config.imageSize);
      
      setImages(prev => prev.map(img => 
        img.id === target.id ? { ...img, status: 'completed', editedUrl } : img
      ));
    } catch (error: any) {
      console.error(`处理图片 ${target.originalName} 时出错:`, error);
      let message = error.message || '处理失败';
      if (message === "PERMISSION_DENIED") {
        message = "权限被拒绝。请尝试切换到 Flash 模型，或选择有效的付费 API 密钥。";
        // @ts-ignore
        if (typeof window.aistudio?.openSelectKey === 'function' && config.model.includes('pro')) {
           // @ts-ignore
           window.aistudio.openSelectKey();
        }
      }
      setImages(prev => prev.map(img => 
        img.id === target.id ? { ...img, status: 'error', error: message } : img
      ));
    }
  };

  const startSingleWorkflow = async (image: ProcessedImage) => {
    if (!config.prompt.trim()) {
      alert("请先输入编辑指令。");
      return;
    }

    await checkApiKeyRequirement();
    await processOne(image);
  };

  const startWorkflow = async () => {
    if (!config.prompt.trim()) {
      alert("请输入编辑指令。");
      return;
    }

    await checkApiKeyRequirement();

    const targets = images.filter(img => img.selected && (img.status === 'pending' || img.status === 'error' || img.status === 'completed'));
    if (targets.length === 0) {
      alert("没有选择需要处理的图片。");
      return;
    };

    setIsProcessing(true);
    setProgress({ current: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setProgress(p => ({ ...p, current: i + 1 }));
      await processOne(target);
    }

    setIsProcessing(false);
  };

  const downloadAllAsZip = async () => {
    const completedImages = images.filter(img => img.status === 'completed' && img.editedUrl);
    if (completedImages.length === 0) return;

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const zipPromises = completedImages.map(async (img) => {
        const response = await fetch(img.editedUrl!);
        const blob = await response.blob();
        const baseName = img.originalName.replace(/\.[^/.]+$/, "");
        const fileName = `gmi-${baseName}.png`;
        zip.file(fileName, blob);
      });

      await Promise.all(zipPromises);
      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `gemini_edits_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
    } catch (error) {
      console.error("生成 ZIP 失败:", error);
      alert("创建 ZIP 文件失败。");
    } finally {
      setIsExporting(false);
    }
  };

  const clearAll = () => {
    if (isProcessing) return;
    images.forEach(img => {
      URL.revokeObjectURL(img.originalUrl);
      if (img.editedUrl) URL.revokeObjectURL(img.editedUrl);
    });
    setImages([]);
    setProgress({ current: 0, total: 0 });
  };

  const openPreview = (image: ProcessedImage, type: 'original' | 'edited') => {
    setPreviewData({ image, initialType: type });
  };

  const completedCount = images.filter(i => i.status === 'completed').length;
  const selectedCount = images.filter(i => i.selected).length;
  const allSelected = images.length > 0 && selectedCount === images.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <aside className="fixed left-0 top-0 h-full w-80 glass border-r border-slate-800 p-6 flex flex-col gap-6 z-50 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <i className="fa-solid fa-wand-magic-sparkles text-xl text-white"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">AI图片翻译</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">批量处理工作流</p>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-white transition-colors"
          >
            <span>模型配置</span>
            <i className={`fa-solid fa-chevron-${showSettings ? 'up' : 'down'}`}></i>
          </button>
          
          {showSettings && (
            <div className="flex flex-col gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-800 animate-in slide-in-from-top-2 duration-200">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">模型</label>
                <select 
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                >
                  {MODEL_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id} title={opt.desc}>{opt.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">生成分辨率</label>
                <select 
                  value={config.imageSize}
                  onChange={(e) => setConfig({ ...config, imageSize: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                >
                  {RESOLUTION_OPTIONS.map(res => (
                    <option key={res} value={res}>{res}</option>
                  ))}
                </select>
                {config.model === 'gemini-2.5-flash-image' && (
                  <p className="text-[9px] text-amber-500/70 mt-1 italic">分辨率设置仅适用于 Pro 模型。</p>
                )}
              </div>

              <button 
                // @ts-ignore
                onClick={() => window.aistudio?.openSelectKey()}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                选择项目密钥
              </button>
              <p className="text-[9px] text-slate-500 italic">Flash 模型默认使用环境密钥。</p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <label className="text-sm font-semibold text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-folder-open text-blue-500"></i>
            源图片
          </label>
          <div className="flex flex-col gap-2">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFolderUpload}
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              id="folder-upload"
            />
            <label 
              htmlFor="folder-upload"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl cursor-pointer transition-all active:scale-95 group"
            >
              <i className="fa-solid fa-upload group-hover:text-blue-400"></i>
              <span className="text-sm font-medium">选择文件夹</span>
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <label className="text-sm font-semibold text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-pen-nib text-blue-500"></i>
            编辑指令
          </label>
          <textarea 
            value={config.prompt}
            onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
            placeholder="例如：将此场景变为赛博朋克风格..."
            className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none placeholder:text-slate-600 transition-all"
          />
        </section>

        <div className="mt-auto flex flex-col gap-3">
          {completedCount > 0 && (
            <button 
              onClick={downloadAllAsZip}
              disabled={isExporting || isProcessing}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {isExporting ? (
                <><i className="fa-solid fa-spinner animate-spin"></i> 压缩中...</>
              ) : (
                <><i className="fa-solid fa-file-zipper"></i> 导出 ZIP (gmi-)</>
              )}
            </button>
          )}

          {images.length > 0 && (
            <button 
              onClick={clearAll}
              disabled={isProcessing}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors py-1 disabled:opacity-50"
            >
              <i className="fa-solid fa-trash-can mr-2"></i>
              清空队列
            </button>
          )}
          
          <button 
            onClick={startWorkflow}
            disabled={isProcessing || images.length === 0 || selectedCount === 0}
            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${
              isProcessing || images.length === 0 || selectedCount === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
            }`}
          >
            {isProcessing ? (
              <><i className="fa-solid fa-spinner animate-spin"></i> 处理中...</>
            ) : (
              <><i className="fa-solid fa-play"></i> 开始批量处理 ({selectedCount})</>
            )}
          </button>
        </div>
      </aside>

      <main className="ml-80 p-8">
        <header className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">工作流队列</h2>
            <p className="text-slate-500 text-sm">
              共计 {images.length} 张 • 已选择 {selectedCount} 张 • 已完成 {completedCount} 张
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             {images.length > 0 && (
               <button 
                 onClick={() => selectAll(!allSelected)}
                 className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
               >
                 {allSelected ? '取消全选' : '全选'}
               </button>
             )}
             {isProcessing && (
                <div className="flex items-center gap-4 bg-slate-900/50 px-6 py-3 rounded-2xl border border-slate-800 animate-in slide-in-from-right-4">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">正在处理</span>
                    <span className="text-[10px] text-slate-500">{progress.current} / {progress.total}</span>
                  </div>
                  <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
          </div>
        </header>

        {images.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-3xl p-20 bg-slate-900/20">
            <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800">
              <i className="fa-solid fa-images text-3xl opacity-30"></i>
            </div>
            <h3 className="text-lg font-medium text-slate-400 mb-2">未加载图片</h3>
            <p className="max-w-xs text-center text-sm mb-6 text-slate-500">
              请从侧边栏选择一个文件夹以开始您的批量编辑工作流。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
            {images.map(image => (
              <ImageCard 
                key={image.id} 
                image={image} 
                onPreview={(type) => openPreview(image, type)}
                onToggleSelect={toggleSelect}
                onGenerateSingle={() => startSingleWorkflow(image)}
              />
            ))}
          </div>
        )}
      </main>

      {previewData && (
        <PreviewModal 
          image={previewData.image}
          initialType={previewData.initialType}
          onClose={() => setPreviewData(null)} 
        />
      )}
    </div>
  );
};

export default App;
