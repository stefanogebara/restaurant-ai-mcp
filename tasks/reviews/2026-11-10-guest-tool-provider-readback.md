# Verify provider-expanded guest tools

- [x] Reproduce ElevenLabs expanding tool IDs into the deprecated response mirror.
- [x] Keep system tools protected by the unchanged-settings fingerprint.
- [x] Verify unique referenced tool identities and one-to-one mirror configurations.
- [x] Compare complete new-tool configurations after removing only observed empty schema defaults.
- [x] Reject unexpected assignments, query schemas and substituted guest inputs.
- [x] Independently review both guard corrections.

## Review

The original operator attached the intended tools but reported failure because the API expanded its tool mirror. Recovery read every original and new workspace record, verified the serving policy and protected configuration, and made no additional provider write. This patch corrects the operator's readback contract. It does not republish the agent or change any phone route.

Focused tests cover mirror identity, headers and proof authority, provider defaults, assignments and query schemas. Real telephone behavior is verified separately; tool configuration alone is not telephone evidence.
