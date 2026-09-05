# Luxómetro Virtual · La Movida SST+

Simulador didáctico interactivo para practicar la operación de un luxómetro y la evaluación básica de iluminancia en lugares de trabajo interiores.

## Versión 2

Esta versión refuerza dos capas de aprendizaje:

1. **Operación del instrumento**: encendido, estabilización del detector, ZERO con tapa, lux/fc, rango AUTO/MANU, HOLD, MAX/MIN, PEAK, REL, perfiles de fuente LS, indicación OL, resolución dependiente del rango y respuesta angular simulada.
2. **Evaluación del área**: área de tarea, circundante inmediata y fondo; rejilla calculada a partir de dimensiones; promedio, mínimo, máximo y uniformidad U₀; tratamiento diferenciado cuando existe luz natural; aproximación de iluminancia cilíndrica mediante cuatro direcciones verticales.

## Escenarios normativos incluidos

- Oficina: escritura, lectura y tratamiento de datos — referencia 34.2.
- Área de inspección en taller de maquinaria — referencia 26.6.
- Almacenamiento en estanterías, a nivel del suelo — referencia 13.5.
- Pasillo central logístico de circulación densa — referencia 13.7.
- Oficina próxima a ventana — misma tarea de oficina, con tratamiento didáctico específico para luz natural/mixta.

## Base documental usada para el diseño didáctico

- UNE-EN 12464-1:2022 — Luz e iluminación. Iluminación de los lugares de trabajo. Parte 1: Lugares de trabajo en interiores.
- ISO/CIE 19476:2014 — Characterization of the performance of illuminance meters and luminance meters.
- Manual de funcionamiento KPS-LX30LED — referencia práctica para secuencias de operación, rangos y funciones del equipo.

Los factores de perfiles de fuente LS y determinados comportamientos del instrumento son **simulados con fines educativos**. No representan una certificación metrológica del equipo ficticio MLX–PRO 900 ni deben trasladarse como factores universales a instrumentos reales.

## Acceso

El acceso de integrantes valida cédula y código mediante la función RPC `acceso_integrante` del proyecto oficial de Supabase. Solo se utiliza una clave pública destinada al navegador; no se incluye ninguna clave `service_role`.

## Desarrollo local

```bash
npm install
npm run dev
```

Compilación:

```bash
npm run build
```

## Autor

Elaborado por **David Linares Brea**  
info@movidasst.com · +56 9 6861 5650  
www.movidasst.com

> Recurso educativo. Los valores son simulados y no sustituyen un luxómetro calibrado, trazabilidad metrológica, una estrategia de muestreo, evaluación de incertidumbre ni una evaluación profesional de iluminación.
