const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const fly = fs.readFileSync(path.join(root, 'fly.toml'), 'utf8');
const dockerPath = fly.match(/^\s*dockerfile\s*=\s*'([^']+)'/m)?.[1];

describe('Fly voice server packaging', () => {
  test('Fly points to a Dockerfile that exists', () => {
    expect(dockerPath).toBeTruthy();
    expect(fs.existsSync(path.join(root, dockerPath))).toBe(true);
  });

  test('the image includes the standalone runtime and its local dependencies', () => {
    const docker = fs.readFileSync(path.join(root, 'api/_voice-server/Dockerfile'), 'utf8');
    const nodeMajor = Number(docker.match(/^FROM node:(\d+)-slim/m)?.[1]);
    expect(nodeMajor).toBeGreaterThanOrEqual(22); // @supabase/supabase-js requires Node 22+
    for (const directory of ['api/_voice-server/', 'api/_lib/', 'api/_services/']) {
      expect(docker).toContain(`COPY ${directory} ./`);
      expect(fs.existsSync(path.join(root, directory))).toBe(true);
    }
    expect(docker).toContain('CMD ["node", "api/_voice-server/index.js"]');
  });
});
