<template>
    <div>
        <template v-for="field in config.components">
            <component v-bind:is="field.type+'-data-field'" :task="task" :config="field">
            </component>
        </template>
    </div>
</template>

<script>
/* global moment */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    beforeCreate: function () {
        this.$options.components.ValueDataField = require("./ValueDataField.vue");
        this.$options.components.BadgeDataField = require("./BadgeDataField.vue");
        this.$options.components.TypeDataField = require ("./TypeDataField.vue");
        this.$options.components.ComposedDataField = require ("./ComposedDataField.vue");
        this.$options.components.AttachmentsDataField = require ("./AttachmentsDataField.vue");
        this.$options.components.LinkDataField = require ("./LinkDataField.vue");
        this.$options.components.CheckBoxDataField = require ("./CheckBoxDataField.vue");
    }
};
</script>

<style lang="sass">
</style>
