const express = require('express');
const { router: authRouter, requireAuth } = require('./src/api/auth');
const { authorize, errorHandler } = require('./src/api/authorize');
const { globalLimiter, authLimiter } = require('./src/api/rateLimit');

const app = express();
const port = 3000;

app.use(globalLimiter);
app.use(express.json());
app.use('/auth', authLimiter, authRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Hello, Express!' });
});

app.post('/', (req, res) => {
  res.status(201).json({ received: req.body });
});

app.put('/:id', requireAuth, authorize('admin', 'user'), (req, res) => {
  res.json({ id: req.params.id, updated: req.body });
});

app.delete('/:id', requireAuth, authorize('admin'), (req, res) => {
  res.json({ id: req.params.id, deleted: true });
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = app;
