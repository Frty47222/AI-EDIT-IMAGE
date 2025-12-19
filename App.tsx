
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
const CONCURRENCY_OPTIONS = [1, 2, 4, 8] as const;

const DEFAULT_PROMPT = `1.将图片上的文字翻译成俄文并替换
2.保持产品原形状，保持原图
3.保持字体原颜色，不要换颜色
4.保持图片原比例，不要缩放`;

const App: React.FC = () => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [config, setConfig] = useState<WorkflowConfig>({
    prompt: DEFAULT_PROMPT,
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    imageSize: '1K',
    customUrl: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    customApiKey: '',
    customModel: 'doubao-seedream-4-5-251128',
    concurrency: 1
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [previewData, setPreviewData] = useState<{ image: ProcessedImage; initialType: 'original' | 'edited' } | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkApiKeyRequirement = async () => {
    if (config.provider === 'gemini' && config.model.includes('gemini-3-pro')) {
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
    setActiveCount(prev => prev + 1);
    setImages(prev => prev.map(img => 
      img.id === target.id ? { ...img, status: 'processing', error: undefined } : img
    ));

    try {
      const { base64, mimeType } = await fileToBase64(target.originalUrl);
      const result = await editImage(base64, mimeType, config.prompt, {
        provider: config.provider,
        model: config.model,
        imageSize: config.imageSize,
        customUrl: config.customUrl,
        customApiKey: config.customApiKey,
        customModel: config.customModel
      });
      
      setImages(prev => prev.map(img => 
        img.id === target.id ? { ...img, status: 'completed', editedUrl: result } : img
      ));
    } catch (error: any) {
      console.error(`处理图片 ${target.originalName} 时出错:`, error);
      let message = error.message || '处理失败';
      if (message === "PERMISSION_DENIED") {
        message = "权限被拒绝。请尝试切换到 Flash 模型，或选择有效的付费 API 密钥。";
      }
      setImages(prev => prev.map(img => 
        img.id === target.id ? { ...img, status: 'error', error: message } : img
      ));
    } finally {
      setActiveCount(prev => prev - 1);
      setProgress(p => ({ ...p, current: p.current + 1 }));
    }
  };

  const startSingleWorkflow = async (image: ProcessedImage) => {
    if (!config.prompt.trim()) {
      alert("请先输入编辑指令。");
      return;
    }

    await checkApiKeyRequirement();
    setProgress({ current: 0, total: 1 });
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

    // 并发池处理逻辑
    const queue = [...targets];
    const workers: Promise<void>[] = [];
    const maxConcurrency = config.concurrency || 1;

    const spawnWorker = async () => {
      while (queue.length > 0) {
        const target = queue.shift();
        if (target) {
          await processOne(target);
        }
      }
    };

    // 启动指定数量的并发 worker
    for (let i = 0; i < Math.min(maxConcurrency, queue.length); i++) {
      workers.push(spawnWorker());
    }

    await Promise.all(workers);
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
        const fileName = `ai-${baseName}.png`;
        zip.file(fileName, blob);
      });

      await Promise.all(zipPromises);
      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `ai_edits_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
    } catch (error) {
      console.error("生成 ZIP 失败:", error);
      alert("创建 ZIP 文件失败。可能是由于第三方图片的跨域限制导致，您可以尝试手动右键保存。");
    } finally {
      setIsExporting(false);
    }
  };

  const clearAll = () => {
    if (isProcessing) return;
    images.forEach(img => {
      URL.revokeObjectURL(img.originalUrl);
    });
    setImages([]);
    setProgress({ current: 0, total: 0 });
    setActiveCount(0);
  };

  const openPreview = (image: ProcessedImage, type: 'original' | 'edited') => {
    setPreviewData({ image, initialType: type });
  };

  const completedCount = images.filter(i => i.status === 'completed').length;
  const selectedCount = images.filter(i => i.selected).length;
  const allSelected = images.length > 0 && selectedCount === images.length;

  const currentResolutions = config.provider === 'custom' 
    ? RESOLUTION_OPTIONS.filter(r => r !== '1K') 
    : RESOLUTION_OPTIONS;

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as 'gemini' | 'custom';
    let newSize = config.imageSize;
    // 豆包模型不支持 1K，自动切换到 2K
    if (newProvider === 'custom' && newSize === '1K') {
      newSize = '2K';
    }
    setConfig({ ...config, provider: newProvider, imageSize: newSize });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <aside className="fixed left-0 top-0 h-full w-80 glass border-r border-slate-800 p-6 flex flex-col gap-6 z-50 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <i className="fa-solid fa-wand-magic-sparkles text-xl text-white"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">AI 图片翻译</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">批量处理工作流</p>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-white transition-colors"
          >
            <span>服务商配置</span>
            <i className={`fa-solid fa-chevron-${showSettings ? 'up' : 'down'}`}></i>
          </button>
          
          {showSettings && (
            <div className="flex flex-col gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-800 animate-in slide-in-from-top-2 duration-200">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">接口类型</label>
                <select 
                  value={config.provider}
                  onChange={handleProviderChange}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer mb-2"
                >
                  <option value="gemini">Google Gemini (原生)</option>
                  <option value="custom">豆包/Ark (自定义)</option>
                </select>
              </div>

              {config.provider === 'gemini' ? (
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">模型</label>
                  <select 
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer mb-2"
                  >
                    {MODEL_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id} title={opt.desc}>{opt.name}</option>
                    ))}
                  </select>
                  <button 
                    // @ts-ignore
                    onClick={() => window.aistudio?.openSelectKey()}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    选择 Pro 项目密钥
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">API 地址</label>
                    <input 
                      type="text"
                      value={config.customUrl}
                      onChange={(e) => setConfig({ ...config, customUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">模型名称 (Model ID)</label>
                    <input 
                      type="text"
                      value={config.customModel}
                      onChange={(e) => setConfig({ ...config, customModel: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">API 密钥 (API Key)</label>
                    <input 
                      type="password"
                      value={config.customApiKey}
                      onChange={(e) => setConfig({ ...config, customApiKey: e.target.value })}
                      placeholder="Ark API Key"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-slate-800 pt-3 mt-1">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500">并发处理数</label>
                  <span className="text-[10px] font-bold text-blue-400">{config.concurrency} 并发</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {CONCURRENCY_OPTIONS.map(val => (
                    <button
                      key={val}
                      onClick={() => setConfig({ ...config, concurrency: val })}
                      className={`py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                        config.concurrency === val
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-600 mt-1.5 leading-tight">高并发可提升处理速度，但请注意 API 限速限制。</p>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">生成分辨率</label>
                <select 
                  value={config.imageSize}
                  onChange={(e) => setConfig({ ...config, imageSize: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  {currentResolutions.map(res => (
                    <option key={res} value={res}>{res}</option>
                  ))}
                </select>
                {config.provider === 'custom' && (
                  <p className="text-[9px] text-slate-600 mt-1">注：豆包模型仅支持 2K 和 4K 分辨率。</p>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <label className="text-sm font-semibold text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-pen-nib text-blue-500"></i>
            翻译/编辑指令
          </label>
          <textarea 
            value={config.prompt}
            onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
            placeholder="例如：将图片上的文字翻译成俄文..."
            className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-all shadow-inner"
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
                <><i className="fa-solid fa-spinner animate-spin"></i> 正在打包...</>
              ) : (
                <><i className="fa-solid fa-file-zipper"></i> 下载全部结果</>
              )}
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
              <><i className="fa-solid fa-spinner animate-spin"></i> 正在处理 ({progress.current}/{progress.total})</>
            ) : (
              <><i className="fa-solid fa-play"></i> 开始批量任务 ({selectedCount})</>
            )}
          </button>
        </div>
      </aside>

      <main className="ml-80 p-8 min-h-screen flex flex-col">
        {/* 隐藏的文件夹上传 Input */}
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFolderUpload}
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          id="main-folder-upload"
        />

        <header className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">任务队列</h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-slate-500 text-sm">
                共 {images.length} 张图片 • 已选择 {selectedCount} • 已完成 {completedCount}
              </p>
              {activeCount > 0 && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[10px] text-blue-400 font-bold animate-pulse">
                  <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                  {activeCount} 并发运行中
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {images.length > 0 && (
               <>
                 <label 
                   htmlFor="main-folder-upload"
                   className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-2"
                 >
                   <i className="fa-solid fa-folder-plus text-blue-500"></i>
                   添加图片
                 </label>
                 <button 
                    onClick={clearAll}
                    disabled={isProcessing}
                    className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <i className="fa-solid fa-trash-can"></i>
                    清空队列
                  </button>
                 <button 
                   onClick={() => selectAll(!allSelected)}
                   className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
                 >
                   {allSelected ? '取消全选' : '全选'}
                 </button>
               </>
             )}
          </div>
        </header>

        {images.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
            <label 
              htmlFor="main-folder-upload"
              className="group relative cursor-pointer"
            >
              <div className="absolute -inset-4 bg-blue-600/20 rounded-[40px] blur-2xl group-hover:bg-blue-600/30 transition-all duration-500" />
              <div className="relative flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-800 rounded-[32px] p-16 bg-slate-900/40 hover:bg-slate-900/60 hover:border-blue-500/50 transition-all duration-300 w-[480px]">
                <div className="w-24 h-24 bg-blue-600/10 rounded-3xl flex items-center justify-center mb-8 border border-blue-500/20 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                  <i className="fa-solid fa-folder-open text-4xl text-blue-500"></i>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">加载图片文件夹</h3>
                <p className="max-w-xs text-center text-sm mb-8 text-slate-500 leading-relaxed">
                  选择本地包含图片的文件夹，我们将自动读取并加入任务队列
                </p>
                <div className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold shadow-xl shadow-blue-600/20 transition-all active:scale-95">
                  立即加载
                </div>
              </div>
            </label>
            <p className="mt-8 text-[10px] text-slate-700 uppercase tracking-[0.3em] font-bold">Supported Formats: JPG, PNG, WEBP</p>
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
