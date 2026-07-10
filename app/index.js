const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello Sourav kumar Dey sarkar! Deploye via CloudFormation + Ansible + GitHub Actions 🚀');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`App running on port ${PORT}`);
});
