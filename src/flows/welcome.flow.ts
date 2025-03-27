import { addKeyword, EVENTS } from '@builderbot/bot';

const welcomeFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.endFlow("Bienvenido al chatbot de iArO! Hace una consulta. mi creador es Ariel Whas +5358688185");
    });

export { welcomeFlow };