import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import { graphql, GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import depthLimit from 'graphql-depth-limit';
import DataLoader from 'dataloader';
import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { loadResolvers } from './users/index'; // This is an example; adjust based on actual resolver structure

// Define the GraphQL schema using code-first approach
const schema = makeExecutableSchema({
  typeDefs: `
    type User {
      id: ID!
      name: String!
      posts: [Post]
    }

    type Post {
      id: ID!
      title: String!
      content: String!
      user: User
    }

    type Query {
      users: [User]
      user(id: ID!): User
      posts: [Post]
      post(id: ID!): Post
    }

    type Mutation {
      createUser(name: String!): User
      createPost(title: String!, content: String!, userId: ID!): Post
    }
  `,
  resolvers: loadResolvers(),
});

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  // Set up Dataloader for batching user data requests to prevent the N+1 problem
  const userLoader = new DataLoader(async (keys) => {
    const users = await prisma.user.findMany({ where: { id: { in: keys as number[] } } });
    return keys.map((key) => users.find((user) => user.id === key));
  });

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req, reply) {
      const { query, variables } = req.body;

      const result = await graphql({
        schema,
        source: query,
        variableValues: variables,
        contextValue: {
          prisma,
          loaders: {
            userLoader,
          },
        },
        validationRules: [depthLimit(5)],
      });

      return reply.send(result);
    },
  });
};

export default plugin;
