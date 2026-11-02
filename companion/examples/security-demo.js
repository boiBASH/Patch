// Synthetic review exercise. This file is never executed.
// Open it in VS Code to see the pet react to three review prompts.

app.use(cors());
router.get('/facilities', async (req, res) => {
  const facilities = await prisma.facility.findMany();
  res.json(facilities);
});

// Real remediation depends on the application's middleware and public response contract.
// Add authentication, role/ownership checks, an origin allowlist and explicit field selection.
