import { createClient } from "@deepgram/sdk";
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

export class AudioTranscriptionService {
    private deepgram;

    constructor() {
        this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
    }

    async transcribeAudio(audioPath: string): Promise<string> {
        try {
            const audioBuffer = await readFile(audioPath);
            const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
                audioBuffer,
                {
                    model: "nova-2",  // Cambiado de nova-3 a nova-2
                    language: "es",
                    smart_format: true, // Añadido para mejorar formato
                    punctuate: true,   // Añadido para mejorar puntuación
                }
            );

            if (error) {
                console.error('Error en transcripción:', error);
                return "Lo siento, hubo un error al procesar el audio.";
            }

            return result.results?.channels[0]?.alternatives[0]?.transcript || "No se pudo transcribir el audio.";
        } catch (error) {
            console.error('Error procesando audio:', error);
            return "Ocurrió un error al procesar el audio.";
        }
    }
}
