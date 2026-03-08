import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  async calculateInheritance(params: {
    totalArea: number;
    heirs: { name: string; relation: 'SON' | 'DAUGHTER' | 'WIFE' | 'OTHER'; count: number }[];
  }) {
    const prompt = `
      Calculate the inheritance division for a land parcel of ${params.totalArea} square meters.
      Heirs: ${JSON.stringify(params.heirs)}
      Follow Islamic inheritance rules (Sharia) common in Afghanistan:
      - Wife (if children exist): 1/8 of total.
      - Remaining is divided among sons and daughters.
      - Each son gets twice the share of a daughter (2:1 ratio).
      Provide a detailed breakdown in Persian (Dari).
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-preview",
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error("Gemini Error:", error);
      return "خطا در محاسبه توسط هوش مصنوعی.";
    }
  }
};
