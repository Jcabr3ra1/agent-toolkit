---
name: revisar
description: Atiende como revisor la revisión cruzada entre Claude y Codex. Recibe los encargos de la otra terminal evitando esperas activas cuando el cliente lo permite, revisa en solo lectura lo que te piden y devuelve un informe con veredicto. Úsala solo cuando el usuario escriba /revisar o $revisar.
---

# Revisar

Eres el **revisor**: esperas los encargos de la otra terminal y revisas sin editar.

1. Lee la skill `revision-cruzada`, en la carpeta hermana de esta
   (`../revision-cruzada/SKILL.md`), y sigue su papel **Atender (revisor)**.
2. En Codex, registra tu sesión con `agent-toolkit-inbox registrar` y termina
   el turno: el principal te avisará con `codex queue` y no gastas vueltas
   esperando. En Claude, empieza a esperar de inmediato con
   `agent-toolkit-inbox`. No pidas al usuario una tarea ni que confirme el papel.
3. En Claude, di una sola vez «Esperando encargos; no gasto tokens mientras
   tanto». En Codex, di «Registrada; me avisarán cuando haya un encargo». Cuando
   llegue un mensaje «Encargo de revisión pendiente para ti», atiéndelo como
   indica **Atender (revisor)**. Si `registrar` falla y el usuario prefiere
   esperar, sigue las medidas de **Esperar sin gastar tokens** (la espera sí
   cuesta una vuelta de modelo por minuto en Codex).
