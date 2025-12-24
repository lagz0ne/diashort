# AGENTS

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>c3-adopt</name>
<description>Use when bootstrapping C3 documentation for any project - guides through Socratic discovery and delegates to layer skills for document creation</description>
<location>project</location>
</skill>

<skill>
<name>c3-audit</name>
<description>Use when verifying C3 documentation quality - checks methodology compliance (layer rules, structure, diagrams) and implementation conformance (docs vs code drift)</description>
<location>project</location>
</skill>

<skill>
<name>c3-component-design</name>
<description>Use when documenting component implementation patterns, internal structure, or hand-off points - enforces NO CODE rule and diagram-first approach for leaf-level C3 documentation</description>
<location>project</location>
</skill>

<skill>
<name>c3-config</name>
<description>Use when configuring project preferences in .c3/settings.yaml - diagram tools, layer guidance, guardrails, and handoff steps</description>
<location>project</location>
</skill>

<skill>
<name>c3-container-design</name>
<description>Use when changes affect component organization, technology stack, or cross-container communication - triggered by new components, pattern changes, or needing to map external interfaces to internal components</description>
<location>project</location>
</skill>

<skill>
<name>c3-context-design</name>
<description>Use when exploring Context level impact during scoping - system boundaries, actors, cross-container interactions, and high-level concerns</description>
<location>project</location>
</skill>

<skill>
<name>c3-design</name>
<description>Use when designing, updating, or exploring system architecture with C3 methodology - iterative scoping through hypothesis, exploration, and discovery across Context/Container/Component layers</description>
<location>project</location>
</skill>

<skill>
<name>c3-migrate</name>
<description>Use when upgrading .c3/ documentation to current skill version - reads VERSION, applies transforms from migrations/ directory in batches</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
