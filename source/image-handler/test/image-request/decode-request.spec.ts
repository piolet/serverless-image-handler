// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockAwsS3 } from "../mock";
import S3 from "aws-sdk/clients/s3";
import SecretsManager from "aws-sdk/clients/secretsmanager";

import { ImageRequest } from "../../image-request";
import { ImageHandlerEvent, StatusCodes } from "../../lib";
import { SecretProvider } from "../../secret-provider";

describe("decodeRequest", () => {
  const s3Client = new S3();
  const secretsManager = new SecretsManager();
  const secretProvider = new SecretProvider(secretsManager);

  it("Should pass if a valid base64-encoded path has been specified", () => {
    // Arrange
    const event = {
      path: "/eyJidWNrZXQiOiJidWNrZXQtbmFtZS1oZXJlIiwia2V5Ijoia2V5LW5hbWUtaGVyZSJ9",
    };

    // Act
    const imageRequest = new ImageRequest(s3Client, secretProvider);
    const result = imageRequest.decodeRequest(event);

    // Assert
    const expectedResult = {
      bucket: "bucket-name-here",
      key: "key-name-here",
    };
    expect(result).toEqual(expectedResult);
  });

  it("Should throw an error if a valid base64-encoded path has not been specified", () => {
    // Arrange
    const event = { path: "/someNonBase64EncodedContentHere" };

    // Act
    const imageRequest = new ImageRequest(s3Client, secretProvider);

    // Assert
    try {
      imageRequest.decodeRequest(event);
    } catch (error) {
      expect(error).toMatchObject({
        status: StatusCodes.BAD_REQUEST,
        code: "DecodeRequest::CannotDecodeRequest",
        message:
          "The image request you provided could not be decoded. Please check that your request is base64 encoded properly and refer to the documentation for additional guidance.",
      });
    }
  });

  it("Should throw an error if no path is specified at all", () => {
    // Arrange
    const event = {};

    // Act
    const imageRequest = new ImageRequest(s3Client, secretProvider);

    // Assert
    try {
      imageRequest.decodeRequest(event);
    } catch (error) {
      expect(error).toMatchObject({
        status: StatusCodes.BAD_REQUEST,
        code: "DecodeRequest::CannotReadPath",
        message:
          "The URL path you provided could not be read. Please ensure that it is properly formed according to the solution documentation.",
      });
    }
  });

  describe("expires", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetAllMocks();
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      jest.clearAllMocks();
      process.env = OLD_ENV;
    });

    const baseRequest = {
      bucket: "validBucket",
      requestType: "Default",
      key: "validKey",
    };
    const path = `/${Buffer.from(JSON.stringify(baseRequest)).toString("base64")}`;
    const mockBody = Buffer.from("SampleImageContent\n");
    it.each([
      {
        expires: "19700101T000000Z",
        error: {
          code: "ImageRequestExpired",
          status: StatusCodes.BAD_REQUEST,
        },
      },
      {
        expires: "19700001T000000Z",
        error: {
          code: "ImageRequestExpiryFormat",
          status: StatusCodes.BAD_REQUEST,
        },
      },
      {
        expires: "19700101S000000Z",
        error: {
          code: "ImageRequestExpiryFormat",
          status: StatusCodes.BAD_REQUEST,
        },
      },
      {
        expires: "19700101T000000",
        error: {
          code: "ImageRequestExpiryFormat",
          status: StatusCodes.BAD_REQUEST,
        },
      },
    ] as { expires: ImageHandlerEvent["queryStringParameters"]["expires"]; error: object }[])(
      "Should throw an error when expires: $expires",
      async ({ error: expectedError, expires }) => {
        // Arrange
        const event: ImageHandlerEvent = {
          path,
          queryStringParameters: {
            expires,
          },
        };
        // Act
        const imageRequest = new ImageRequest(s3Client, secretProvider);
        await expect(imageRequest.setup(event)).rejects.toMatchObject(expectedError);
      }
    );

    it("Should validate request if expires is not provided", async () => {
      // Arrange
      process.env = { SOURCE_BUCKETS: "validBucket, validBucket2" };
      const event: ImageHandlerEvent = {
        path,
      };
      // Mock
      mockAwsS3.getObject.mockImplementationOnce(() => ({
        promise() {
          return Promise.resolve({ Body: mockBody });
        },
      }));
      // Act
      const imageRequest = new ImageRequest(s3Client, secretProvider);

      const imageRequestInfo = await imageRequest.setup(event);

      // Assert
      expect(mockAwsS3.getObject).toHaveBeenCalledWith({
        Bucket: "validBucket",
        Key: "validKey",
      });

      expect(imageRequestInfo.originalImage).toEqual(mockBody);
    });

    it("Should validate request if expires is valid", async () => {
      // Arrange
      const validDate = new Date();
      validDate.setFullYear(validDate.getFullYear() + 1);
      const validDateString = validDate.toISOString().replace(/-/g, "").replace(/:/g, "").slice(0, 15) + "Z";

      process.env = { SOURCE_BUCKETS: "validBucket, validBucket2" };

      const event: ImageHandlerEvent = {
        path,
        queryStringParameters: {
          expires: validDateString,
        },
      };
      // Mock
      mockAwsS3.getObject.mockImplementationOnce(() => ({
        promise() {
          return Promise.resolve({ Body: mockBody });
        },
      }));
      // Act
      const imageRequest = new ImageRequest(s3Client, secretProvider);
      const imageRequestInfo = await imageRequest.setup(event);
      expect(mockAwsS3.getObject).toHaveBeenCalledWith({
        Bucket: "validBucket",
        Key: "validKey",
      });
      expect(imageRequestInfo.originalImage).toEqual(mockBody);
    });
  });
});
