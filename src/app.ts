import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { image2text, askAboutImage, messageHistory } from './scripts/gemini'
import { commands, prompts, defaultSystemPrompt } from './config/llmConfig'
import "dotenv/config";
import { unlink } from 'fs/promises';
import { WebService } from './services/webSearch';
import { AudioTranscriptionService } from './services/audioTranscription';

const PORT = process.env.PORT ?? 3009

import { welcomeFlow } from './flows/welcome.flow';
import { chat } from './scripts/gemini'

const webService = new WebService();
const audioService = new AudioTranscriptionService();

const imageFlow = addKeyword(EVENTS.MEDIA)
    .addAction(async (ctx, ctxFn) => {
        const userId = ctx.from;
        const messageText = ctx.body || "Por favor, describe esta imagen en español de manera detallada y natural."; // Usamos el texto enviado o el prompt predefinido

        const localPath = await ctxFn.provider.saveFile(ctx, { path: './assets' });
        
        setTimeout(async () => {
            try {
                await unlink(localPath);
                messageHistory.removeLastImage(userId);
                console.log(`Imagen eliminada: ${localPath}`);
            } catch (error) {
                console.error('Error al eliminar imagen:', error);
            }
        }, 300000); // Aumentamos el tiempo a 5 minutos para dar más tiempo para preguntas

        const response = await image2text(messageText, localPath, userId);
        await ctxFn.flowDynamic([
            response,
            "Puedes hacerme preguntas específicas sobre esta imagen durante los próximos 5 minutos."
        ]);
    });

const audioFlow = addKeyword(EVENTS.VOICE_NOTE)
    .addAction(async (ctx, ctxFn) => {
        const userId = ctx.from;
        await ctxFn.flowDynamic('🎧 Procesando el audio...');
        
        const localPath = await ctxFn.provider.saveFile(ctx, { path: './assets' });
        
        setTimeout(async () => {
            try {
                await unlink(localPath);
                console.log(`Audio eliminado: ${localPath}`);
            } catch (error) {
                console.error('Error al eliminar audio:', error);
            }
        }, 60000);

        const transcription = await audioService.transcribeAudio(localPath);
        
        // Verificar si la transcripción contiene el comando de búsqueda
        if (transcription.toLowerCase().startsWith(commands.search)) {
            const query = transcription.slice(commands.search.length).trim();
            if (query) {
                await ctxFn.flowDynamic('🔍 Buscando información...');
                const result = await webService.searchGoogle(query, userId);
                return await ctxFn.flowDynamic([
                    `🗣️ *Transcripción:*\n${transcription}\n\n📝 *Respuesta:*\n${result}`
                ]);
            } else {
                await ctxFn.flowDynamic([
                    `🗣️ *Transcripción:*\n${transcription}\n\n📝 *Respuesta:*\nUso: busca en internet <tu búsqueda>`
                ]);
                return;
            }
        }

        const response = await chat(defaultSystemPrompt, transcription, userId);
        
        await ctxFn.flowDynamic([
            `🗣️ *Transcripción:*\n${transcription}\n\n📝 *Respuesta:*\n${response}`
        ]);
    });

const mainFlow = addKeyword<Provider, Database>(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        const bodyText: string = ctx.body.toLowerCase();
        const userId = ctx.from;

        // Agregamos manejo de preguntas sobre la última imagen
        if (bodyText.startsWith('imagen ')) {
            const question = ctx.body.slice(7).trim();
            const response = await askAboutImage(userId, question);
            return await ctxFn.flowDynamic(response);
        }

        // Manejador de búsqueda
        if (bodyText.startsWith(commands.search)) {
            const query = ctx.body.slice(commands.search.length).trim();
            if (!query) return await ctxFn.flowDynamic('Uso: busca en internet <tu búsqueda>');
            await ctxFn.flowDynamic('🔍 Buscando información...');
            const result = await webService.searchGoogle(query, userId);
            return await ctxFn.flowDynamic(result);
        }

        // Manejador de noticias
        if (bodyText.startsWith(commands.news)) {
            const news = await webService.getNews();
            return await ctxFn.flowDynamic(news);
        }

        // Manejador del clima
        if (bodyText.startsWith(commands.weather)) {
            const city = ctx.body.slice(commands.weather.length).trim();
            if (!city) return await ctxFn.flowDynamic('Uso: /clima <ciudad>');
            const weather = await webService.getWeather(city);
            return await ctxFn.flowDynamic(weather);
        }

        // Manejar comando chat-off
        if (bodyText.startsWith(commands.chatOff)) {
            const targetUserId = bodyText.slice(commands.chatOff.length).trim() || userId;
            if (!targetUserId.match(/^[0-9]+$/)) {
                return await ctxFn.flowDynamic('Uso: /chat-off <número> o /chat-off');
            }
            messageHistory.setChatEnabled(targetUserId, false);
            return await ctxFn.flowDynamic(
                targetUserId === userId ? 
                'Chat desactivado. Ya no responderé a tus mensajes.' :
                `Chat desactivado para el número ${targetUserId}.`
            );
        }

        // Manejar comando chat-on
        if (bodyText.startsWith(commands.chatOn)) {
            const targetUserId = bodyText.slice(commands.chatOn.length).trim() || userId;
            if (!targetUserId.match(/^[0-9]+$/)) {
                return await ctxFn.flowDynamic('Uso: /chat-on <número> o /chat-on');
            }
            messageHistory.setChatEnabled(targetUserId, true);
            return await ctxFn.flowDynamic(
                targetUserId === userId ? 
                'Chat activado. He vuelto a estar disponible.' :
                `Chat activado para el número ${targetUserId}.`
            );
        }

        // Verificar si el chat está habilitado antes de procesar cualquier mensaje
        if (!messageHistory.isChatEnabled(userId)) {
            return; // No responder si el chat está desactivado
        }

        // Manejar comando de system prompt
        if (bodyText.startsWith(commands.systemPrompt)) {
            const parts = ctx.body.slice(commands.systemPrompt.length).trim().split(' ');
            
            // Verificar si el primer argumento es un número de teléfono
            const targetUserId = parts[0]?.match(/^[0-9]+$/) ? parts.shift() : userId;
            const newPrompt = parts.join(' ').trim();

            if (!newPrompt) {
                return await ctxFn.flowDynamic([
                    'Uso: /prompt <nuevo prompt del sistema>',
                    'o: /prompt <número> <nuevo prompt del sistema>'
                ]);
            }

            messageHistory.setSystemPrompt(targetUserId, newPrompt);
            const response = targetUserId === userId ? 
                'Prompt del sistema actualizado.' :
                `Prompt del sistema actualizado para el número ${targetUserId}.`;
            
            return await ctxFn.flowDynamic(response);
        }

        // Nuevo: verificar si es un comando reset con número de teléfono
        const resetCommand = commands.reset.find(cmd => bodyText.startsWith(cmd));
        if (resetCommand) {
            const targetUserId = bodyText.slice(resetCommand.length).trim();
            if (targetUserId.match(/^[0-9]+$/)) {
                messageHistory.resetUserChat(targetUserId);
                return await ctxFn.flowDynamic(`Chat reiniciado para el número ${targetUserId}. El prompt del sistema se mantiene.`);
            }
            messageHistory.resetUserChat(userId);
            return await ctxFn.flowDynamic('Chat reiniciado. El prompt del sistema se mantiene. ¿En qué puedo ayudarte?');
        }

        if (commands.greetings.some(keyword => bodyText.includes(keyword))) {
            return await ctxFn.gotoFlow(welcomeFlow);
        }

        if (commands.imageQuestions.some(indicator => bodyText.includes(indicator))) {
            const response = await askAboutImage(userId, ctx.body);
            return await ctxFn.flowDynamic(response);
        }

        const systemPrompt = messageHistory.getSystemPrompt(userId) || prompts.defaultAssistant;
        const response = await chat(systemPrompt, ctx.body, userId);
        await ctxFn.flowDynamic(response);
    });

const main = async () => {
    const adapterFlow = createFlow([welcomeFlow, mainFlow, imageFlow, audioFlow])

    const adapterProvider = createProvider(Provider)
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })
    
    httpServer(+PORT)
}

main()
