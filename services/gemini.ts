
import { GoogleGenAI } from "@google/genai";

export async function editImage(
  base64Image: string,
  mimeType: string,
  prompt: string,
  modelName: string = 'gemini-2.5-flash-image',
  imageSize: string = '1K'
): Promise<string> {
  // 直接从环境读取 API_KEY
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
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

    const config: any = {
      model: modelName,
      contents: { parts },
    };

    // 针对图像生成/编辑模型配置 imageConfig
    if (modelName.includes('image')) {
      const imageConfig: any = {
        aspectRatio: "1:1"
      };
      
      // 重要修复：imageSize 仅支持 gemini-3-pro-image-preview
      // 只有在模型支持时才传递该参数，否则会报 400 错误
      if (modelName === 'gemini-3-pro-image-preview') {
        imageConfig.imageSize = imageSize;
      }

      config.config = {
        imageConfig
      };
    }

    const response = await ai.models.generateContent(config);

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
    if (textPart) {
       throw new Error(`Model returned text: ${textPart.text}`);
    }

    throw new Error("The model did not return any image data.");
  } catch (error: any) {
    console.error("Gemini SDK Error:", error);
    // 权限错误处理
    if (error.message?.includes("403") || error.message?.includes("PERMISSION_DENIED")) {
      throw new Error("PERMISSION_DENIED");
    }
    throw error;
  }
}
