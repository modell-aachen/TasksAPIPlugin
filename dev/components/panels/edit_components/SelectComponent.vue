<template>
    <select v-model="fields[fieldName].value">
        <option v-for="option in fields[fieldName].options" v-bind:value="option">{{mappedValue(option)}}</option>
    </select>
</template>

<script>
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    methods: {
        mappedValue(key){
            return this.fields[this.fieldName].map[key];
        }
    }
};
</script>

<style lang="sass">
</style>
