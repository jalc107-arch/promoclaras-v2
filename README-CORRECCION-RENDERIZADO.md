# Corrección definitiva del texto de las cuadrículas

Esta actualización cambia el conversor de las imágenes promocionales para que cargue directamente las fuentes incluidas en el proyecto. No depende de las fuentes instaladas en Railway.

## Archivos que deben subirse a GitHub

- `services/promotionalContentService.js`
- `lib/infographic/svgRenderer.js`
- `assets/fonts/DejaVuSans.ttf`
- `assets/fonts/DejaVuSans-Bold.ttf`
- `package.json`
- `package-lock.json`

También puede subirse este archivo de instrucciones, aunque no es necesario para el funcionamiento.

## Después de subirlos

1. Confirma el cambio en la rama `main`.
2. Espera a que Railway muestre `Deployment successful`.
3. Abre de nuevo el contenido promocional de la campaña.
4. Pulsa `Generar imágenes` para crear una generación nueva.

No reutilices una imagen descargada antes de esta actualización.
