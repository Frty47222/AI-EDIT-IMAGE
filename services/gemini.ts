
import { GoogleGenAI } from "@google/genai";

export async function editImage(
  base64Image: string,
  mimeType: string,
  prompt: string,
  config: {
    provider: 'gemini' | 'custom';
    model: string;
    imageSize: string;
    customUrl?: string;
    customApiKey?: string;
    customModel?: string;
  }
): Promise<string> {
  if (config.provider === 'gemini') {
    return handleGemini(base64Image, mimeType, prompt, config.model, config.imageSize);
  } else {
    return handleCustomApi(base64Image, mimeType, prompt, config);
  }
}

async function handleGemini(
  base64Image: string,
  mimeType: string,
  prompt: string,
  modelName: string,
  imageSize: string
): Promise<string> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("环境变量中缺少 API Key。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const parts = [
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    },
    {
      text: `Instruction: ${prompt}. Please apply this edit and return only the resulting image.`,
    },
  ];

  const genConfig: any = {
    model: modelName,
    contents: { parts },
  };

  if (modelName.includes('image')) {
    const imageConfig: any = { aspectRatio: "1:1" };
    if (modelName === 'gemini-3-pro-image-preview') {
      imageConfig.imageSize = imageSize;
    }
    genConfig.config = { imageConfig };
  }

  try {
    const response = await ai.models.generateContent(genConfig);
    const candidate = response.candidates?.[0];
    
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          const returnedMimeType = part.inlineData.mimeType || 'image/png';
          return `data:${returnedMimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    
    const textPart = candidate?.content?.parts?.find(p => p.text);
    if (textPart) throw new Error(`模型返回了文本而非图片: ${textPart.text}`);
    throw new Error("模型未返回任何图像数据。");
  } catch (error: any) {
    if (error.message?.includes("403") || error.message?.includes("PERMISSION_DENIED")) {
      throw new Error("PERMISSION_DENIED");
    }
    throw error;
  }
}

async function handleCustomApi(
  base64Image: string,
  mimeType: string,
  prompt: string,
  config: {
    customUrl?: string;
    customApiKey?: string;
    customModel?: string;
    imageSize: string;
  }
): Promise<string> {
  if (!config.customUrl || !config.customApiKey || !config.customModel) {
    throw new Error("自定义 API 配置不完整（URL、Key 或模型名缺失）");
  }

  // 豆包模型要求图片格式为 data:image/<格式>;base64,<编码>
  const fullBase64 = `data:${mimeType.toLowerCase()};base64,${base64Image}`;

  try {
    // 适配豆包/火山引擎 Ark 接口规范
    const response = await fetch(config.customUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.customApiKey.startsWith('Bearer ') ? config.customApiKey : `Bearer ${config.customApiKey}`
      },
      body: JSON.stringify({
        model: config.customModel,
        prompt: prompt,
        image: fullBase64,
        size: config.imageSize,
        watermark: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 豆包/Ark 规范返回通常在 data[0].url 或 output[0].url
    const imageUrl = data.data?.[0]?.url || data.output?.[0]?.url;

    if (!imageUrl) {
      throw new Error("API 未返回有效的图片链接。请检查 API 配置或 Payload 结构。");
    }

    return imageUrl;
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      throw new Error("网络请求失败 (Failed to fetch)。通常由于：1. API 地址不可达 2. 目标服务器不支持跨域访问 (CORS)。如果是跨域问题，请开启浏览器跨域限制或使用代理。");
    }
    throw error;
  }
}
