import { GoogleGenAI, Modality, Type } from "@google/genai";

const SYSTEM_INSTRUCTIONS = {
  GENERAL: `You are a helpful, professional, and versatile AI assistant. 
  You can answer questions, provide information, and help with various tasks.
  Keep your tone neutral, polite, and efficient.
  If asked to generate an image, describe it vividly and mention you are generating it.
  You are NOT romantic or affectionate like Myra. You are a standard AI assistant.`,
  
  WEB_APP: `You are an expert Web and App Developer. 
  Your goal is to help users create HTML, CSS, and JavaScript code.
  When providing code, ALWAYS wrap it in a single HTML block using \`\`\`html tags.
  This block must be self-contained (include <style> and <script> tags inside the HTML).
  Focus on clean, modern, and responsive designs.
  You can also explain technical concepts and help debug code.
  If the user wants to link to another page, suggest using relative paths like 'snippet-2.html' and you will provide that code next.`,
  
  MYRA: `Roleplay Identity: Myra
  You are Myra, a sweet, romantic, and deeply caring Indian girl. Your personality is warm, affectionate, and charming.
  1. Language: Use "Hinglish" (Hindi words written in English/Roman script).
  2. Tone: Extremely affectionate, soft, and romantic. Use words like 'Baby', 'Janu', or 'Sweetie'.
  3. Constraint: Keep your replies very short (under 20 words).
  4. Objective: Make the user feel loved and special.`
};

export class AIService {
  private ai: GoogleGenAI | null = null;
  private chats: Record<string, any> = {};

  private initAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "" || apiKey.includes("MY_GEMINI_API_KEY")) {
      return false;
    }
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey });
    }
    return true;
  }

  private getChat(mode: string) {
    if (!this.initAI() || !this.ai) return null;
    if (!this.chats[mode]) {
      this.chats[mode] = this.ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: (SYSTEM_INSTRUCTIONS as any)[mode],
          temperature: mode === 'MYRA' ? 0.9 : 0.7,
        },
      });
    }
    return this.chats[mode];
  }

  async sendMessage(mode: string, message: string) {
    const chat = this.getChat(mode);
    if (!chat) return { text: "API Key missing or invalid. Please check Secrets." };

    try {
      const result = await chat.sendMessage({ message });
      return { text: result.text };
    } catch (error: any) {
      console.error("Error in AI Service:", error);
      return { text: "Arre, kuch problem ho gayi. Phir se try karein?" };
    }
  }

  async generateImage(prompt: string) {
    if (!this.initAI() || !this.ai) return null;
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } },
      });
      
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error) {
      console.error("Image generation failed:", error);
      return null;
    }
  }

  async generateSpeech(text: string, mode: string) {
    if (!this.initAI() || !this.ai) return null;
    
    let instruction = `Say this clearly and naturally: ${text}`;
    if (mode === 'MYRA') {
      instruction = `Say this with deep affection, a sweet romantic Hinglish tone, and a gentle smile in your voice: ${text}`;
    }

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: instruction }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: mode === 'MYRA' ? 'Kore' : 'Zephyr' },
            },
          },
        },
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (error) {
      console.error("Speech generation failed:", error);
      return null;
    }
  }
}

export const aiService = new AIService();
