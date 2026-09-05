# Simulador de Luxómetro · La Movida SST+

Aplicación didáctica interactiva para que profesionales de Seguridad y Salud en el Trabajo practiquen la medición de iluminancia: preparación, puesta a cero, selección de unidad y rango, elección del plano, posicionamiento del sensor, lectura puntual, malla de puntos, uniformidad y documentación.

## Funciones principales

- Acceso para integrantes registrados mediante cédula y código de integrante.
- Luxómetro virtual con fotodetector separado y controles manipulables.
- Cinco escenarios laborales con distribuciones de luz distintas.
- Unidades lux y foot-candle, conversión `1 fc = 10,764 lx`.
- Rangos AUTO, 200, 2.000, 20.000 y 200.000 lux, con indicación de sobrecarga.
- Puesta a cero con tapa, función HOLD y registro mínimo/máximo.
- Planos horizontal, vertical y de circulación.
- Errores simulados de sombra del evaluador, inclinación y sensor cubierto.
- Malla de nueve puntos con promedio, mínimo, máximo y uniformidad `Emin / Eprom`.
- Modo guiado de diez pasos, ayuda contextual, tutorial, manual con buscador y memoria local.
- Diseño responsivo para computadora, tableta y teléfono.

## Desarrollo local

```bash
npm install
npm run dev
```

Para generar los archivos públicos:

```bash
npm run build
```

## Acceso y seguridad

La validación utiliza la función RPC `acceso_integrante` del proyecto oficial de Supabase y una clave pública destinada al navegador. No se incluye ninguna clave secreta o `service_role`.

## Autor

Elaborado por **David Linares Brea**  
info@movidasst.com · +56 9 6861 5650

> Recurso educativo. Los valores son simulados y no sustituyen un luxómetro calibrado, una estrategia de muestreo ni una evaluación profesional de iluminación ocupacional.
