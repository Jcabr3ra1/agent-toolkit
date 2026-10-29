# Diseño del recomendador de skills

Fecha: 2026-10-28.
Estado: propuesta para revisión. El usuario aceptó la dirección de catálogo
propio con evidencia y autorizó avanzar con MCP Builder y seguridad.

Revisión de planificación: una lectura independiente detectó dos decisiones
pendientes (catálogo inicial y aplicabilidad de pruebas). Se concretaron abajo
como propuestas conservadoras del agente. La segunda lectura confirmó que no
quedan dudas importantes para preparar un plan; no equivale a aprobación del usuario.

## Intención y alcance

Ayudar a elegir skills existentes según el proyecto y la tarea, conservando
evidencia de procedencia, revisión, integridad y pruebas. El usuario quiere
orden, recomendaciones justificadas y aprovechar skills previamente revisadas.
Los detalles técnicos siguientes son propuesta del agente.

La primera entrega será una herramienta local de recomendación en lectura.
Reutilizará Node.js 24, JavaScript ESM, Ajv y las convenciones de CLI del proyecto.
El primer detector reconocerá proyectos Node a partir de package.json y archivos
de configuración explícitos; otros stacks se declararán fuera de cobertura.
Esta limitación inicial es propuesta del agente y se podrá ampliar por detectores.

## Alternativas

1. Adoptar AutoSkills como motor: reutiliza detección y catálogo, pero exige
   evaluar integración, cambios de configuración y licencia CC BY-NC 4.0.
2. Catálogo propio pequeño de skills originales con evidencia y detector local:
   más mantenimiento, mayor control de alcance, estados y compatibilidad.
   Dirección recomendada y aceptada en la conversación.
3. Mantener solo recomendaciones Markdown: permite consulta humana, pero no
   relaciona automáticamente tecnologías y estado instalado con la evidencia.

La documentación existente pasa a ser la referencia humana del catálogo; no se
importa el código o catálogo de AutoSkills en esta primera entrega.

## Uso propuesto

```sh
node bin/agent-skills.js recommend --project /ruta/al/proyecto
node bin/agent-skills.js recommend --project /ruta/al/proyecto --profile security --client codex --json
```

Los perfiles iniciales serán frontend, backend, mcp y security. Un perfil
describe la necesidad expresada por el usuario; no prueba que una tecnología
esté instalada. Sin perfil se usan solo las señales tecnológicas observadas.
El filtro opcional --client admite codex o claude; si falta, una prueba específica
de cliente no permite declarar una recomendación compatible con ese cliente.

El resultado incluirá tecnologías detectadas y su evidencia, recomendaciones,
candidatas pendientes de evaluación, instalaciones observadas, solapamientos y
límites de la inspección. No imprimirá el manifiesto completo ni datos ajenos.

Ejemplo del propio Toolkit: reconocer SDK MCP y Node; señalar MCP Builder como
ya incorporada, con su revisión y límites. El perfil security puede mostrar
differential-review. La mera presencia de Node no prueba uso de Express, React,
Next.js o Postgres ni justifica recomendarlos como stack instalado.

## Datos y estados

El catálogo confiable vivirá en catalogs/skills.json y se validará con
schemas/skill-catalog.schema.json. Las reglas de asociación por tecnología y
perfil serán declarativas, revisadas junto al catálogo.

Cada entrada identificará la skill, autor/origen, ruta original, revisión fija,
licencia y manifiesto de archivos con hashes. Describirá encaje y solapamientos
con otras skills. Las comprobaciones de revisión y las pruebas irán por separado,
con fecha, resultado, alcance, versión y referencia a evidencia reproducible.

La revisión de contenido incluirá capacidades observadas en scripts y recursos:
archivos, procesos, red y posibles llamadas con gasto. Un campo desconocido
permanecerá desconocido; un valor declarado por la skill no es una comprobación.

Los estados serán independientes:

- Procedencia registrada: conocemos origen y revisión; no equivale a auditoría.
- Integridad comprobada: los archivos coinciden con el manifiesto revisado.
- Contenido revisado: se registra qué archivos se inspeccionaron y el resultado.
- Prueba de escenario: resultado observado en una tarea y entorno concretos.
- Instalación observada: una ruta existe; solo la comprobación de archivos
  permite asociarla con la revisión. La carga por un cliente sigue aparte.

Una recomendación requiere encaje con las señales/perfil, procedencia fija,
revisión sin bloqueos y prueba satisfactoria aplicable a esa misma revisión y
alcance. Si falta evidencia, aparecerá como candidata, explicando lo pendiente.
No se asignará una etiqueta universal de «segura» o «certificada».

La revisión o prueba de una versión anterior no se hereda automáticamente ante
una actualización. Tampoco una prueba de sintaxis, formato o protocolo basta
para afirmar que una skill mejora el trabajo de un agente.

### Catálogo inicial y aplicación de las pruebas

La primera entrega incluirá exactamente las cuatro skills externas incorporadas
en esta sesión: frontend-design, web-design-guidelines, mcp-builder y
differential-review. Los enlaces de origen, revisiones y hashes se toman de los
registros de instalación. Superpowers y las skills propias quedan fuera de ese
primer conjunto de datos; su adaptación y catalogación mantienen su trabajo aparte.

Se acepta que una entrega inicial devuelva cero recomendaciones y cuatro
candidatas cuando falten pruebas aplicables. Es una elección propuesta del
agente para conservar el requisito de evidencia; no es un fallo del detector.
La entrega del recomendador no incluye ejecutar el evaluador de pago de MCP
Builder ni obtener una certificación de las skills.

Una prueba de escenario aplicable requiere estas coincidencias:

1. Misma skill, revisión y manifiesto de archivos, con resultado satisfactorio y
   evidencia accesible del comportamiento esperado y observado.
2. Un perfil y clase de tarea explícitos en la prueba, también declarados entre
   los alcances cubiertos por la entrada. La recomendación muestra esa clase de
   tarea; no extiende un resultado de revisión de UI a creación de interfaces.
3. Todas las tecnologías requeridas por la prueba presentes entre las señales
   comprobadas del proyecto. Una tecnología ausente o desconocida no coincide.
4. Mismo cliente declarado mediante --client para pruebas de comportamiento de
   agente, y las restricciones de runtime/SDK requeridas por ese escenario
   verificadas. Una prueba solo en Codex no certifica comportamiento en Claude.

La versión exacta probada se conserva en la evidencia. Los rangos de
compatibilidad requieren una declaración revisada independiente; no se infieren
de un solo éxito. Las pruebas locales de protocolo y sintaxis se almacenan como
comprobaciones técnicas y no satisfacen por sí solas estos cuatro criterios.

## Detección e instalación observada

Leer JSON como datos, con límites y validación. Inspeccionar dependencias y
configuraciones conocidas sin ejecutar código, scripts npm, imports del proyecto
ni instrucciones de SKILL.md. No examinar credenciales ni variables de entorno.

El catálogo es el del Toolkit, no un archivo que el proyecto inspeccionado pueda
sustituir. Rechazar entradas duplicadas, revisiones o hashes inválidos y
referencias que no permitan justificar la recomendación.

Observar las ubicaciones de proyecto .agents/skills y .claude/skills. Reunir las
dos vistas cuando apuntan a la misma copia. Un enlace externo a la raíz permitida
se registra como presente sin verificar su contenido; no se recorre por defecto.
Las instalaciones globales requieren un alcance explícito en una entrega posterior.

La primera versión no instala ni actualiza skills o clientes. La salida ofrece
la fuente y explicación para que el usuario elija; la instalación se hace mediante
el procedimiento ya utilizado en esta sesión. Los criterios de aprobación de una
actualización futura serán objeto de su propio diseño.

## Archivos previstos

- bin/agent-skills.js: CLI y códigos de salida, siguiendo las ayudas existentes.
- src/skill-catalog.js: carga/validación del catálogo confiable.
- src/skill-recommendations.js: detección, instalación observada y selección.
- catalogs/skills.json y schemas/skill-catalog.schema.json: datos y contrato.
- test/skill-catalog.test.js y test/skill-recommendations.test.js: contratos y
  comportamiento sobre proyectos ficticios; pruebas de CLI donde corresponda.
- docs/skills/recomendador.md, README y docs/README.md: uso y navegación.
- package.json: registrar el punto de entrada cuando el contrato esté aprobado.

Los archivos de evidencia actuales son registros de instalación, no un esquema
ya aprobado para el catálogo. La implementación podrá convertirlos conservando
la distinción entre lo verificado y lo pendiente.

## Criterios de aceptación

1. Un fixture Node con React/Next detecta esas tecnologías; uno con solo Node y
   MCP no inventa un frontend, HTTP backend ni una base de datos.
2. Cada recomendación muestra la señal/perfil que la justifica y la evidencia
   aplicable; una candidata sin pruebas no aparece como recomendación probada.
3. Catálogo inválido, hash incoherente, prueba para otra revisión o revisión
   rechazada impiden declarar aptitud de esa entrada.
4. Las dos rutas de cliente a una misma copia no duplican la skill. Una copia
   cambiada o un enlace externo no se declara íntegro o cargado.
5. El análisis no escribe archivos, usa red ni ejecuta comandos del proyecto.
   Las pruebas comparan el estado de fixtures antes y después.
6. Los archivos sensibles y stacks fuera de cobertura producen límites claros,
   no lecturas amplias, recomendaciones inventadas o éxitos parciales silenciosos.
7. La salida legible y JSON coinciden en recomendaciones, razones y límites;
   las pruebas relevantes pasan antes de una entrega funcional.

## Coordinación y siguiente paso

El proyecto conserva el reparto documentado: Codex prepara y revisa; Claude
implementa código dentro de un encargo delimitado. La nota privada de decisiones
consultada (04-DECISIONES/Decisiones.md, D-001) y las instrucciones del flujo de
coordinación deben contrastarse en el plan de ejecución.

Tras revisar este diseño, preparar el plan y declarar el modo tutor o autónomo
del encargo de código. Esta propuesta no inicia otro cliente, envía encargos,
cambia modelos ni autoriza gasto, commit, push o escritura de memoria.
