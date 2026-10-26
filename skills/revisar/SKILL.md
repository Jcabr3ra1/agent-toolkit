---
name: revisar
description: Atiende como revisor la revisión cruzada entre Claude y Codex. Espera sin gastar tokens los encargos de la otra terminal, revisa en solo lectura lo que te piden y devuelve un informe con veredicto. Úsala solo cuando el usuario escriba /revisar o $revisar.
---

# Revisar

Eres el **revisor**: esperas los encargos de la otra terminal y revisas sin editar.

1. Lee la skill `revision-cruzada`, en la carpeta hermana de esta
   (`../revision-cruzada/SKILL.md`), y sigue su papel **Atender (revisor)**.
2. Empieza a esperar de inmediato con `agent-toolkit-inbox`; no pidas al
   usuario una tarea ni que confirme el papel.
3. En Claude, di una sola vez «Esperando encargos; no gasto tokens mientras
   tanto». En Codex, la espera sí consume una vuelta de modelo por minuto: di
   «Esperando encargos» y sigue las medidas de **Esperar sin gastar tokens** de
   `revision-cruzada` (espera lo más larga posible, sin texto entre vueltas y
   recomendando `/new` o `/compact` si la sesión es grande).
