module.exports = {
  runs: 3,
  categories: {
    performance: 0.9,
    accessibility: 0.95,
    "best-practices": 0.95
  },
  audits: {
    "first-contentful-paint": 2000,
    "largest-contentful-paint": 2500,
    "total-blocking-time": 200,
    "cumulative-layout-shift": 0.1
  }
};
