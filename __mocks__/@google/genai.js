// __mocks__/@google/genai.js
const GoogleGenAI = jest.fn().mockImplementation((apiKey) => {
  return {
    getGenerativeModel: jest.fn().mockImplementation((options) => {
      return {
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => '["query1", "query2", "query3"]'
          }
        }),
        embedContent: jest.fn()
      };
    })
  };
});

module.exports = {
  GoogleGenAI,
  HarmCategory: {},
  HarmBlockThreshold: {},
};