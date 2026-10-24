const express = require('express');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello, Express!' });
});

app.post('/', (req, res) => {
  res.status(201).json({ received: req.body });
});

app.put('/:id', (req, res) => {
  res.json({ id: req.params.id, updated: req.body });
});

app.delete('/:id', (req, res) => {
  res.json({ id: req.params.id, deleted: true });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
