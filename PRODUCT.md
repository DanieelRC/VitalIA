# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Nutriólogo(a)** de un solo consultorio en México. Usa la app en escritorio durante la consulta (captura SOAP/PES, antropometría, arma el plan) y entre consultas (mensajes, agenda).
- **Paciente** del consultorio, invitado por su nutriólogo. Usa la app sobre todo en el teléfono (PWA): consulta su plan y menú, registra progreso y recordatorio de 24 h, agenda citas, escribe mensajes y pregunta al asistente Vita.

## Product Purpose

Plataforma de consulta nutricional: expediente clínico-nutricional del nutriólogo y portal de seguimiento del paciente. Éxito = el nutriólogo documenta y calcula un plan completo en una consulta, y el paciente entiende y sigue su plan entre consultas.

## Positioning

Un solo flujo clínico de extremo a extremo con criterios mexicanos (SMAE, NOM-004, LFPDPPP): GEB → GET → macros → tiempos de comida → equivalentes con adecuación → menú, conectado al portal del paciente y a un asistente de IA que responde con los datos propios del paciente.

## Operating Context

Consultorio único. Español de México. Zona horaria America/Mexico_City. Pacientes entran solo por invitación. Documentos: plan y expediente en PDF.

## Capabilities and Constraints

- Next.js 15 (App Router) + Supabase (RLS) + Tailwind 4; PWA.
- Notas SOAP firmadas son inmutables; correcciones por adenda.
- Asistente "Vita" (Grok) con presupuesto mensual, límites y filtro de emergencias/TCA; no diagnostica.
- El contenido base (SMAE, recetas, suplementos, rutinas) debe revisarlo el nutriólogo.

## Brand Commitments

- Se conserva únicamente el nombre **VitalIA**. Ícono, color y tipografía son libres (confirmado por el usuario, 2026-11-15).
- Voz con el paciente: **cálida y cercana**, de tú, sin juicios.
- No debe sentirse como: sistema de hospital frío, app de gimnasio/cultura de dieta, infantil o gamificada, ni lujo tipo spa (confirmado por el usuario).

## Evidence on Hand

Catálogo sembrado (≈140 alimentos, 30 recetas, 20 suplementos, 30 ejercicios). No hay testimonios, clientes, logo ni fotografía; no inventarlos.

## Product Principles

1. La tarea clínica primero: nada decorativo estorba capturar, calcular o leer.
2. Acompañar sin juzgar: los datos del paciente se muestran como avance, no como calificación.
3. Rigor visible: fórmulas, métodos y fuentes siempre a la vista.
4. Privacidad por defecto: el paciente solo ve lo suyo; las notas clínicas nunca se le muestran.

## Accessibility & Inclusion

Contraste AA, navegación por teclado, respeto a `prefers-reduced-motion`; legible en teléfonos de gama media.
