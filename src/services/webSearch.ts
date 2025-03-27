import axios from 'axios';
import * as cheerio from 'cheerio';
import { chat } from '../scripts/gemini';

export class WebService {
    async searchGoogle(query: string, userId: string): Promise<string> {
        try {
            const response = await axios.get(
                `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=5`
            );

            if (response.data.items && response.data.items.length > 0) {
                // Recopilamos información de los primeros 5 resultados
                const searchResults = response.data.items.map(item => 
                    `${item.title}\n${item.snippet}`
                ).join('\n\n');

                // Prompt para que Gemini procese los resultados
                const systemPrompt = 
                `Eres un asistente experto en sintetizar información. 
                 Analiza estos resultados de búsqueda y proporciona una respuesta 
                 completa y bien estructurada sobre: "${query}".
                 Incluye los datos más relevantes y asegúrate de que la respuesta sea coherente.`;

                // Procesamos con Gemini
                const aiResponse = await chat(systemPrompt, searchResults, userId);
                return aiResponse;
            }
            
            return 'No encontré información relevante sobre tu búsqueda.';
        } catch (error) {
            console.error('Error en búsqueda:', error);
            return 'Hubo un error al buscar la información. Por favor, intenta más tarde.';
        }
    }

    async getNews(): Promise<string> {
        try {
            const response = await axios.get('https://news.google.com/rss');
            const $ = cheerio.load(response.data, { xmlMode: true });
            const news = $('item').slice(0, 5).map((_, item) => {
                return `📰 ${$(item).find('title').text()}\n`;
            }).get().join('\n');
            return `Últimas noticias:\n\n${news}`;
        } catch (error) {
            return 'No pude obtener las noticias en este momento.';
        }
    }

    async getWeather(city: string): Promise<string> {
        try {
            const response = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${city}`);
            const weather = response.data.current;
            return `Clima en ${city}:\nTemperatura: ${weather.temp_c}°C\nCondición: ${weather.condition.text}`;
        } catch (error) {
            return 'No pude obtener la información del clima.';
        }
    }
}
