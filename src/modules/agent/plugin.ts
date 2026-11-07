import { join } from 'node:path';

/**
 * The Agent's local plugin: its one Skill, `quellen-recherche`. Resolved from
 * the working directory, which is the repo root in development and the
 * standalone server's directory in the image (next.config.ts traces it there).
 */
export const AGENT_PLUGIN_DIR = join(process.cwd(), 'src/modules/agent/agent-plugin');

/** The plugin's Skills, as the Agent SDK names them: `<plugin name>:<skill>`. */
export const AGENT_SKILLS = ['notebook:quellen-recherche'];
