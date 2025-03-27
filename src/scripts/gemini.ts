import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import fs from 'fs';
import { LLMConfig, defaultConfig } from '../config/llmConfig';
import { MessageHistory } from '../utils/MessageHistory';

dotenv.config();

// Access your API key as an environment variable.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cambiar de const a export const para que sea accesible
export const messageHistory = new MessageHistory();

export async function chat(prompt: string, text: string, userId: string, config: LLMConfig = defaultConfig) {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: {
            temperature: config.temperature,
            topK: config.topK,
            topP: config.topP,
            maxOutputTokens: config.maxOutputTokens,
        }
    });

    const history = config.memoryEnabled ? 
        messageHistory.getHistory(userId, config.memoryWindow) : [];
    
    const contextPrompt = history
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

    const fullPrompt = `Sos un asistente virtual con memoria de conversaciones previas.
    
    Historial de la conversación:
    ${contextPrompt}
    
    ${prompt}
    
    El input del usuario es el siguiente: ${text}`;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const answ = response.text();

    // Agregar delay de 5 segundos
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (config.memoryEnabled) {
        messageHistory.addMessage(userId, 'user', text);
        messageHistory.addMessage(userId, 'assistant', answ);
    }

    return answ;
}

export async function image2text(prompt: string, imagePath: string, userId?: string, config: LLMConfig = defaultConfig): Promise<string> {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",  // Cambiamos a gemini-pro-vision
        generationConfig: {
            temperature: 0.7,  // Ajustamos para respuestas más naturales
            maxOutputTokens: 1000,
            topP: 0.8,
            topK: 40,
        }
    });

    try {
        const resolvedPath = path.resolve(imagePath);
        const imageBuffer = fs.readFileSync(resolvedPath);
        
        const image = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: "image/jpeg",
            },
        };

        if (userId) {
            messageHistory.setLastImage(userId, imagePath);
        }

        const systemPrompt = "Eres un asistente experto en describir imágenes. Por favor, proporciona una descripción detallada y natural en español de la imagen que te muestro. Céntrate en los elementos importantes y el contexto general.";
        const result = await model.generateContent([systemPrompt, prompt, image]);
        return result.response.text();
    } catch (error) {
        console.error('Error procesando imagen:', error);
        return "Lo siento, hubo un error al procesar la imagen.";
    }
}

export async function askAboutImage(userId: string, question: string): Promise<string> {
    const lastImage = messageHistory.getLastImage(userId);
    if (!lastImage) {
        return "No hay una imagen reciente sobre la cual responder.";
    }
    return await image2text(question, lastImage, userId);
}