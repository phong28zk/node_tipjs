"use strict";

const shopModel = require("../models/shop.model");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const KeyTokenService = require("./keyToken.service");
const { createTokenPair } = require("../auth/authUtils");
const { getInfoData } = require("../utils");
const {
  BadRequestError,
  ConflictRquestError,
  AuthFailureError,
} = require("../core/error.response");


const { findByEmail } = require("./shop.service");

const RoleShop = {
  SHOP: "SHOP",
  WRITER: "WRITER",
  EDITOR: "EDITOR",
  ADMIN: "ADMIN",
};

class AccessService {
  static signUp = async ({ name, email, password }) => {
    // try {
    // step 1: Check email exist?
    const holderShop = await shopModel.findOne({ email }).lean();
    if (holderShop) {
      throw new BadRequestError("Error: Shop already registered!");
    }

    // step 2: Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashPassword = bcrypt.hashSync(password, salt);

    const newShop = await shopModel.create({
      name,
      email,
      password: hashPassword,
      roles: [RoleShop.SHOP],
    });

    // step 3: Create privateKey, publicKey and save collection keyStore
    if (newShop) {
      // created privateKey, publicKey
      // const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      //   modulusLength: 4096,
      //   publicKeyEncoding: {
      //     type: "pkcs1",
      //     format: "pem",
      //   },
      //   privateKeyEncoding: {
      //     type: "pkcs1",
      //     format: "pem",
      //   },
      // });
      const privateKey = crypto.randomBytes(64).toString("hex");
      const publicKey = crypto.randomBytes(64).toString("hex");
      console.log({ privateKey, publicKey }); // save collection keyStore
      const publicKeyString = await KeyTokenService.createKeyToken({
        userId: newShop._id,
        publicKey,
      });
      if (!publicKeyString) {
        return {
          code: "xxxx",
          message: "Create publicKey fail",
        };
      }

      const publicKeyObject = crypto.createPublicKey({
        key: publicKeyString,
        format: "pem",
        type: "spki",
      });

      // step 4: Create token pair
      const tokens = await createTokenPair(
        {
          userId: newShop._id,
          email,
        },
        publicKeyString,
        privateKey
      );
      // console.log("Token pair: ", tokens);

      return {
        code: 201,
        metadata: {
          shop: getInfoData({
            fields: ["_id", "name", "email"],
            object: newShop,
          }),
          tokens,
        },
      };
    }

    return { code: 200, metadata: null };

    // } catch (error) {
    //   return { code: "xxx", message: error.message, status: error };
    // }
  };

  
  static login = async ({ email, password, refreshToken = null}) => {
    // step 1: Check email exist?
    const foundShop = await findByEmail({ email });
    if(!foundShop) throw new BadRequestError("Error: Shop not found!");

    // step 2: Match password
    const match = bcrypt.compare(password, foundShop.password);
    if(!match) throw new AuthFailureError("Error: Auth error!");
    
    // step 3: Create token pair and save
    const privateKey = crypto.randomBytes(64).toString("hex");
    const publicKey = crypto.randomBytes(64).toString("hex");
    const publicKeyString = await KeyTokenService.createKeyToken({
      userId: foundShop._id,
      publicKey,
    });
    if (!publicKeyString) {
      return {
        code: "xxxx",
        message: "Create publicKey fail",
      };
    }
    // step 4: Generate token pair
    const { _id: userId } = foundShop;
    const tokens = await createTokenPair(
      {
        userId,
        email,
      },
      publicKeyString,
      privateKey
    );

    await KeyTokenService.createKeyToken({
      refreshToken: tokens.refreshToken,
      publicKey,
      privateKey,
      userId
    })

    return {
        shop: getInfoData({
          fields: ["_id", "name", "email"],
          object: foundShop,
        }),
        tokens,
    };
  }
}

module.exports = AccessService;
