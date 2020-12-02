const path = require('path')
const express = require('express')

const app = express()

app.use(express.static(path.join(__dirname, '..', 'dist')))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'))
})

if (process.env.ENVIRONMENT === 'development') {
  const PORT = 1102
  app.listen(PORT, () => console.log(`app is listening on port ${PORT}`))
}

module.exports = app
